"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const gameUtils_1 = require("./gameUtils");
class Resistance {
    constructor(key, players) {
        this.disconnect = () => {
            index_1.io.of('/').in(`${this.key}`).emit('playerDisconnected');
            this.sockets.forEach(s => {
                this.events.forEach(event => {
                    if (event === 'disconnect')
                        s.removeListener(event, this.disconnect);
                    else
                        s.removeAllListeners(event);
                });
            });
            if (index_1.rooms[this.key])
                index_1.rooms[this.key].gameStarted = false;
        };
        this.start = () => {
            this.sockets.forEach(socket => {
                socket.on('disconnect', this.disconnect);
                socket.on('ready', () => {
                    if (this.roles.length) {
                        const role = this.roles.pop();
                        if (!role)
                            throw new Error('Missing role');
                        socket.emit('role', role);
                        socket.emit('transition', `Your are a ${role} member`);
                        socket.emit('missions', this.missions);
                        socket.emit('teamCreation');
                        socket.emit('teamLeader', this.players[this.leaderIdx]);
                    }
                });
                socket.on('teamUpdate', (type, player) => {
                    if (type === 'choose')
                        this.team = this.team.concat(player);
                    else
                        this.team = this.team.filter(p => p !== player);
                    index_1.io.of('/').in(`${this.key}`).emit('teamUpdate', this.team);
                });
                socket.on('teamConfirm', () => {
                    const reqTeamSize = this.missions[this.missionIdx].numPlayers;
                    if (this.team.length === reqTeamSize) {
                        index_1.io.of('/').in(`${this.key}`).emit('teamConfirm', this.team);
                    }
                    else if (this.team.length > reqTeamSize) {
                        socket.emit(index_1.INVALID_ACTION, `Too many players: mission needs ${reqTeamSize} players`);
                    }
                    else {
                        socket.emit(index_1.INVALID_ACTION, `Not enough players: mission needs ${reqTeamSize} players`);
                    }
                });
                socket.on('vote', (vote, name) => {
                    if (vote === 'approve')
                        this.votes.approve.push(name);
                    else
                        this.votes.reject.push(name);
                    const roomSize = this.players.length;
                    if (this.votes.approve.length + this.votes.reject.length === roomSize) {
                        this.leaderIdx = (this.leaderIdx + 1) % roomSize;
                        this.team = [];
                        if (this.votes.approve.length > this.votes.reject.length) {
                            index_1.io.of('/').in(`${this.key}`).emit('teamApproved');
                            index_1.io.of('/').in(`${this.key}`)
                                .emit('transition', 'Team has been approved, mission will begin shortly.');
                        }
                        else {
                            index_1.io.of('/').in(`${this.key}`)
                                .emit('transition', 'Team has been rejected, new leader will selected.');
                            index_1.io.of('/').in(`${this.key}`)
                                .emit('teamRejected', this.players[this.leaderIdx], this.votes);
                        }
                        this.votes = { approve: [], reject: [] };
                    }
                });
                socket.on('mission', (result) => {
                    result === 'pass'
                        ? this.missionResult.pass += 1
                        : this.missionResult.fail += 1;
                    const teamSize = this.missions[this.missionIdx].numPlayers;
                    if (this.missionResult.pass + this.missionResult.fail === teamSize) {
                        const result = this.missionResult.fail === 0 ? 'passed' : 'failed';
                        this.missionResult = { pass: 0, fail: 0 };
                        this.missions[this.missionIdx].result = result;
                        this.missionIdx++;
                        let resistance = 0;
                        let spies = 0;
                        this.missions.forEach(mission => {
                            if (!mission.result)
                                return;
                            mission.result === 'passed' ? resistance += 1 : spies += 1;
                        });
                        let winner;
                        if (resistance === 3)
                            winner = 'resistance';
                        if (spies === 3)
                            winner = 'spies';
                        if (winner) {
                            index_1.io.of('/').in(`${this.key}`).emit('gameOver', winner);
                            this.sockets.forEach(s => {
                                this.events.forEach(event => {
                                    if (event === 'disconnect')
                                        s.removeListener(event, this.disconnect);
                                    else
                                        s.removeAllListeners(event);
                                });
                            });
                            if (index_1.rooms[this.key])
                                index_1.rooms[this.key].gameStarted = false;
                            else
                                throw new Error('Room does not exist');
                            return;
                        }
                        index_1.io.of('/').in(`${this.key}`)
                            .emit('transition', `The mission has ${result}. New team leader will
							be chosen for the next mission. `);
                        index_1.io.of('/').in(`${this.key}`).emit('teamCreation');
                        index_1.io.of('/').in(`${this.key}`).emit('teamUpdate', this.team);
                        index_1.io.of('/').in(`${this.key}`)
                            .emit('teamLeader', this.players[this.leaderIdx]);
                        index_1.io.of('/').in(`${this.key}`)
                            .emit('teamLeader', this.players[this.leaderIdx]);
                        index_1.io.of('/').in(`${this.key}`).emit('missions', this.missions);
                    }
                });
            });
        };
        this.events = ['ready', 'teamUpdate', 'teamConfirm',
            'vote', 'mission', 'disconnect'];
        this.key = key;
        this.players = players;
        this.missions = [];
        this.team = [];
        this.leaderIdx = Math.floor(Math.random() * this.players.length);
        const playerObjects = index_1.io.sockets.adapter.rooms[this.key];
        const playerIds = Object.keys(playerObjects.sockets);
        this.sockets = playerIds.map(id => index_1.io.sockets.connected[id]);
        this.roles = gameUtils_1.generateRoles(this.players.length);
        gameUtils_1.MISSION_TEAMS[this.players.length].forEach((numPlayers, index) => this.missions[index] = { numPlayers, result: '' });
        this.votes = { approve: [], reject: [] };
        this.missionResult = { pass: 0, fail: 0 };
        this.missionIdx = 0;
    }
}
exports.default = Resistance;
