// PeerJS networking layer.
// Host-authoritative: host runs game, clients send inputs and receive state.

const PEER_PREFIX = 'tankbrawl-9f3a-';

function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function peerId(code) { return PEER_PREFIX + code.toUpperCase(); }

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.myId = null;
    this.myName = '';

    // Host state
    this.connections = new Map(); // peerId -> conn (client side connections)
    this.players = new Map(); // playerId -> { id, name, team, isHost }

    // Client state
    this.hostConn = null;

    // Callbacks
    this.onLobbyUpdate = () => {};
    this.onError = () => {};
    this.onStateMsg = () => {};
    this.onStartMatch = () => {};
    this.onEndMatch = () => {};
    this.onInput = () => {};
    this.onConnected = () => {};
    this.onDisconnected = () => {};
  }

  // --- Host ---
  async createRoom(myName) {
    this.myName = myName;
    this.isHost = true;
    this.roomCode = genCode(6);
    return new Promise((resolve, reject) => {
      const id = peerId(this.roomCode);
      this.peer = new Peer(id, { debug: 1 });
      this.myId = id;
      const fail = (err) => {
        this.onError(err.type === 'unavailable-id'
          ? 'Room code already in use, try again'
          : (err.message || 'Network error'));
        reject(err);
      };
      this.peer.on('open', () => {
        this.players.set(this.myId, {
          id: this.myId, name: this.myName, team: null, isHost: true,
        });
        this._broadcastLobby();
        this.onLobbyUpdate(this._lobbyState());
        resolve(this.roomCode);
      });
      this.peer.on('error', fail);
      this.peer.on('connection', (conn) => this._onIncomingClient(conn));
    });
  }

  _onIncomingClient(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });
    conn.on('data', (msg) => this._handleHostMsg(conn, msg));
    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.players.delete(conn.peer);
      this._broadcastLobby();
      this.onLobbyUpdate(this._lobbyState());
      this.onDisconnected(conn.peer);
    });
    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.players.delete(conn.peer);
      this._broadcastLobby();
      this.onLobbyUpdate(this._lobbyState());
    });
  }

  _handleHostMsg(conn, msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'hello': {
        this.players.set(conn.peer, {
          id: conn.peer,
          name: (msg.name || 'Player').slice(0, 16),
          team: null,
          isHost: false,
        });
        this._broadcastLobby();
        this.onLobbyUpdate(this._lobbyState());
        break;
      }
      case 'team': {
        const p = this.players.get(conn.peer);
        if (p) {
          p.team = msg.team === 'blue' || msg.team === 'red' ? msg.team : null;
          this._broadcastLobby();
          this.onLobbyUpdate(this._lobbyState());
        }
        break;
      }
      case 'input': {
        this.onInput(conn.peer, msg.input);
        break;
      }
    }
  }

  setMyTeam(team) {
    if (this.isHost) {
      const me = this.players.get(this.myId);
      if (me) {
        me.team = team;
        this._broadcastLobby();
        this.onLobbyUpdate(this._lobbyState());
      }
    } else {
      this._sendToHost({ t: 'team', team });
    }
  }

  _broadcastLobby() {
    const state = this._lobbyState();
    for (const conn of this.connections.values()) {
      try { conn.send({ t: 'lobby', state }); } catch (_) {}
    }
  }

  _lobbyState() {
    return {
      roomCode: this.roomCode,
      hostId: this.myId,
      players: Array.from(this.players.values()),
    };
  }

  startMatch(matchInit) {
    if (!this.isHost) return;
    for (const conn of this.connections.values()) {
      try { conn.send({ t: 'start', init: matchInit }); } catch (_) {}
    }
    this.onStartMatch(matchInit);
  }

  broadcastState(state) {
    if (!this.isHost) return;
    for (const conn of this.connections.values()) {
      try { conn.send({ t: 'state', s: state }); } catch (_) {}
    }
  }

  broadcastEvent(evt) {
    if (!this.isHost) return;
    for (const conn of this.connections.values()) {
      try { conn.send({ t: 'evt', e: evt }); } catch (_) {}
    }
  }

  endMatch(stats) {
    if (this.isHost) {
      for (const conn of this.connections.values()) {
        try { conn.send({ t: 'end', stats }); } catch (_) {}
      }
    }
    this.onEndMatch(stats);
  }

  returnToLobby() {
    if (!this.isHost) return;
    for (const conn of this.connections.values()) {
      try { conn.send({ t: 'lobbyReturn' }); } catch (_) {}
    }
  }

  // --- Client ---
  async joinRoom(myName, roomCode) {
    this.myName = myName;
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    return new Promise((resolve, reject) => {
      this.peer = new Peer(undefined, { debug: 1 });
      this.peer.on('open', (id) => {
        this.myId = id;
        const conn = this.peer.connect(peerId(this.roomCode), { reliable: true });
        this.hostConn = conn;
        let opened = false;
        conn.on('open', () => {
          opened = true;
          conn.send({ t: 'hello', name: this.myName });
          this.onConnected();
          resolve();
        });
        conn.on('data', (msg) => this._handleClientMsg(msg));
        conn.on('close', () => {
          this.onDisconnected('host');
        });
        conn.on('error', (err) => {
          if (!opened) reject(err);
        });
        setTimeout(() => {
          if (!opened) {
            reject(new Error('Could not connect to room — check the code'));
          }
        }, 8000);
      });
      this.peer.on('error', (err) => {
        const msg = err.type === 'peer-unavailable'
          ? 'Room not found — check the code'
          : (err.message || 'Network error');
        this.onError(msg);
        reject(new Error(msg));
      });
    });
  }

  _handleClientMsg(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'lobby':
        this.onLobbyUpdate(msg.state);
        break;
      case 'start':
        this.onStartMatch(msg.init);
        break;
      case 'state':
        this.onStateMsg(msg.s);
        break;
      case 'evt':
        this.onStateMsg(null, msg.e);
        break;
      case 'end':
        this.onEndMatch(msg.stats);
        break;
      case 'lobbyReturn':
        this.onLobbyUpdate(null);
        break;
    }
  }

  _sendToHost(msg) {
    if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch (_) {}
    }
  }

  sendInput(input) {
    if (this.isHost) {
      this.onInput(this.myId, input);
    } else {
      this._sendToHost({ t: 'input', input });
    }
  }

  destroy() {
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
    }
    this.peer = null;
    this.connections.clear();
    this.players.clear();
    this.hostConn = null;
  }
}
