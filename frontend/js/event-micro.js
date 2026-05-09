const VOTE_PRICE = 5;
let selectedCandidate = null;

const params = new URLSearchParams(window.location.search);
const slug = params.get('event');
const elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
const event = elections.find(e => e.slug === slug) || { title: 'Event not found', positions: [] };
document.getElementById('eventTitle').textContent = event.title;
document.getElementById('eventDesc').textContent = event.description || '';

const candidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]').filter(c => c.electionId === event._id);
const container = document.getElementById('categories');
(event.positions || []).forEach(pos => {
  const posCandidates = candidates.filter(c => c.position === pos);
  container.innerHTML += `<div class="category"><h3>${pos} (${posCandidates.length})</h3>` +
    posCandidates.map(c => `
      <div class="candidate" onclick="select('${c._id}', this)">
        <div class="avatar">${c.firstName[0]}${c.lastName[0]}</div>
        <div style="flex:1"><strong>${c.firstName} ${c.lastName}</strong><br><small>${c.bio||''}</small></div>
        <div class="radio"></div>
      </div>`).join('') + '</div>';
});

function select(id, el) {
  document.querySelectorAll('.candidate').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedCandidate = id;
  document.getElementById('payBtn').disabled = false;
}

function changeQty(delta) {
  const qty = document.getElementById('qty');
  let val = parseInt(qty.value) + delta;
  if (val < 1) val = 1;
  if (val > 100) val = 100;
  qty.value = val;
  document.getElementById('total').textContent = (val * VOTE_PRICE).toFixed(2);
}

function pay() {
  if (!selectedCandidate) return;
  const qty = parseInt(document.getElementById('qty').value);
  const amount = qty * VOTE_PRICE;
  const handler = PaystackPop.setup({
    key: 'pk_test_xxxxxxxx', // replace with your key
    email: 'voter@example.com',
    amount: amount * 100,
    currency: 'GHS',
    ref: 'VW-MICRO-' + Date.now(),
    callback: function(response) {
      let cands = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
      const idx = cands.findIndex(c => c._id === selectedCandidate);
      if (idx !== -1) cands[idx].votes = (cands[idx].votes || 0) + qty;
      localStorage.setItem('votewave_candidates', JSON.stringify(cands));
      alert('✅ Vote recorded!');
    },
    onClose: () => alert('Cancelled')
  });
  handler.openIframe();
}