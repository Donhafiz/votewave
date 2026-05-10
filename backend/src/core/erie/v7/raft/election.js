async function startElection(node, requestVoteFn) {
  node.becomeCandidate();

  let votes = 1;

  const results = await Promise.all(
    node.peers.map((peer) =>
      requestVoteFn(peer, {
        term: node.term,
        candidateId: node.nodeId,
      })
    )
  );

  votes += results.filter(Boolean).length;

  const quorum = Math.floor((node.peers.length + 1) / 2) + 1;

  if (votes >= quorum) {
    node.becomeLeader();
    return true;
  }

  node.becomeFollower(node.term);
  return false;
}

module.exports = { startElection };