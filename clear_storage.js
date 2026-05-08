// Clear localStorage to remove invalid election IDs
console.log('Clearing localStorage...');
localStorage.removeItem('votewave_elections');
localStorage.removeItem('votewave_users');
localStorage.removeItem('votewave_votes');
console.log('LocalStorage cleared!');
