let io = null;

const initializeSocket = (socketIo) => {
  io = socketIo;
  
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-election', (electionId) => {
      socket.join(`election-${electionId}`);
      console.log(`Socket ${socket.id} joined election ${electionId}`);
    });

    socket.on('leave-election', (electionId) => {
      socket.leave(`election-${electionId}`);
      console.log(`Socket ${socket.id} left election ${electionId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

const emitVoteUpdate = (electionId, voteData) => {
  if (io) {
    io.to(`election-${electionId}`).emit('vote-update', voteData);
  }
};

const emitElectionStatusChange = (electionId, status) => {
  if (io) {
    io.to(`election-${electionId}`).emit('status-change', { electionId, status });
    io.emit('election-updated', { electionId, status });
  }
};

const emitNewElection = (election) => {
  if (io) {
    io.emit('new-election', election);
  }
};

const emitElectionResults = (electionId, results) => {
  if (io) {
    io.to(`election-${electionId}`).emit('results-available', results);
  }
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initializeSocket,
  emitVoteUpdate,
  emitElectionStatusChange,
  emitNewElection,
  emitElectionResults,
  getIO,
};
