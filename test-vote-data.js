// Test data for vote.html page
// Run this in browser console to populate localStorage with test data

const testElections = [
  {
    _id: 'test-election-1',
    title: 'Student Council Election 2024',
    positions: ['President', 'Vice President', 'Secretary'],
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    isActive: true
  }
];

const testCandidates = [
  {
    _id: 'candidate-1',
    electionId: 'test-election-1',
    position: 'President',
    firstName: 'John',
    lastName: 'Doe',
    bio: 'Experienced student leader with vision for change',
    votes: 0
  },
  {
    _id: 'candidate-2',
    electionId: 'test-election-1',
    position: 'President',
    firstName: 'Jane',
    lastName: 'Smith',
    bio: 'Dedicated to improving student life',
    votes: 0
  },
  {
    _id: 'candidate-3',
    electionId: 'test-election-1',
    position: 'Vice President',
    firstName: 'Mike',
    lastName: 'Johnson',
    bio: 'Strong organizational skills',
    votes: 0
  }
];

// Populate localStorage
localStorage.setItem('votewave_elections', JSON.stringify(testElections));
localStorage.setItem('votewave_candidates', JSON.stringify(testCandidates));

console.log('Test data loaded! Navigate to vote.html?id=test-election-1 to test.');
