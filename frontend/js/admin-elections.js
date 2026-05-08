/**
 * VoteWave - Admin Elections Management
 * Complete CRUD operations for elections
 */

let currentElections = [];
let currentPage = 1;
let editingElectionId = null;
let deletingElectionId = null;

// Generate a valid MongoDB ObjectId-like string for localStorage
function generateMockObjectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const randomBytes = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => 
    (Math.random() * 16 | 0).toString(16)
  );
  return timestamp + randomBytes;
}

document.addEventListener('DOMContentLoaded', () => {
  initElectionsPage();
});

function initElectionsPage() {
  loadElections();
  initElectionModals();
  initElectionFilters();
  initElectionFormButtons();
  checkUrlParams();
}

// Check URL for actions
function checkUrlParams() {
  const action = getUrlParam('action');
  const editId = getUrlParam('edit');
  
  if (action === 'create') {
    openCreateElectionModal();
  } else if (editId) {
    loadElectionForEdit(editId);
  }
}

// Load elections
async function loadElections(page = 1) {
  const tbody = document.getElementById('electionsTableBody');
  const loading = document.getElementById('tableLoading');
  const empty = document.getElementById('emptyState');
  
  if (loading) loading.classList.remove('hidden');
  if (tbody) tbody.innerHTML = '';
  if (empty) empty.classList.add('hidden');
  
  currentPage = page;
  
  try {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', 10);
    
    const statusFilter = document.getElementById('statusFilter')?.value;
    const searchQuery = document.getElementById('searchInput')?.value;
    
    if (statusFilter) params.append('status', statusFilter);
    if (searchQuery) params.append('search', searchQuery);
    
    const response = await adminApiRequest(`/elections?${params}`);
    
    if (response.success && response.data.length > 0) {
      currentElections = response.data;
      renderElectionsTable(response.data);
      renderPagination(response.pagination);
    } else if (response.success && response.data.length === 0) {
      if (!loadLocalElections()) {
        if (empty) empty.classList.remove('hidden');
      }
    } else {
      // Load local fallback or sample data
      if (!loadLocalElections()) {
        loadSampleElections();
      }
    }
  } catch (error) {
    console.log('Loading local or sample elections', error);
    if (!loadLocalElections()) {
      loadSampleElections();
    }
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function loadSampleElections() {
  currentElections = [
    { _id: '1', title: 'Student Council 2026', type: 'student', status: 'active', description: 'Annual student council election', startDate: '2026-03-15', endDate: '2026-03-20', totalVotes: 1247, turnout: 78, paymentStatus: 'paid' },
    { _id: '2', title: 'Best Teacher Award 2026', type: 'nomination', status: 'active', description: 'Faculty recognition awards', startDate: '2026-03-10', endDate: '2026-03-18', totalVotes: 892, turnout: 64, paymentStatus: 'paid' },
    { _id: '3', title: 'Annual Fest Theme Vote', type: 'event', status: 'completed', description: 'Student vote for annual festival theme', startDate: '2026-02-25', endDate: '2026-03-05', totalVotes: 2150, turnout: 92, paymentStatus: 'paid' },
    { _id: '4', title: 'Club President Election', type: 'club', status: 'upcoming', description: 'Tech club leadership vote', startDate: '2026-03-25', endDate: '2026-03-28', totalVotes: 0, turnout: 0, paymentStatus: 'unpaid' },
    { _id: '5', title: 'Department Representative', type: 'student', status: 'draft', description: 'Department rep election', startDate: '2026-04-01', endDate: '2026-04-05', totalVotes: 0, turnout: 0, paymentStatus: 'unpaid' },
  ];
  renderElectionsTable(currentElections);
  renderPagination({ page: 1, totalPages: 1, hasNext: false });
}

function getLocalStoredElections() {
  return JSON.parse(localStorage.getItem('votewave_elections') || '[]');
}

function loadLocalElections() {
  const elections = getLocalStoredElections();
  if (elections.length === 0) return false;

  currentElections = elections;
  renderElectionsTable(currentElections);
  renderPagination({ page: 1, totalPages: 1, hasNext: false });
  return true;
}

function renderElectionsTable(elections) {
  const tbody = document.getElementById('electionsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = elections.map(election => {
    const statusBadge = `<span class="admin-badge ${election.status}">${election.status}</span>`;
    const paymentBadge = election.paymentStatus ? 
      `<span class="admin-badge ${election.paymentStatus}">${election.paymentStatus}</span>` : '';
    
    let actions = `
      <button class="admin-action-btn edit-btn" data-election-id="${election._id}" title="Edit">
        <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
      </button>
    `;
    
    if (election.status === 'draft' && election.paymentStatus === 'paid') {
      actions += `
        <button class="admin-action-btn success activate-btn" data-election-id="${election._id}" title="Activate">
          <i data-lucide="play" style="width:14px;height:14px;"></i>
        </button>
      `;
    }
    
    if (election.status === 'draft' && election.paymentStatus !== 'paid') {
      actions += `
        <button class="admin-action-btn pay-btn" data-election-id="${election._id}" title="Pay & Activate" style="color:#f59e0b;">
          <i data-lucide="credit-card" style="width:14px;height:14px;"></i>
        </button>
      `;
    }
    
    if (election.status === 'active') {
      actions += `
        <button class="admin-action-btn warning close-btn" data-election-id="${election._id}" title="Close Election">
          <i data-lucide="stop-circle" style="width:14px;height:14px;"></i>
        </button>
      `;
    }
    
    actions += `
      <button class="admin-action-btn categories-btn" data-election-id="${election._id}" title="Manage Categories">
        <i data-lucide="folder" style="width:14px;height:14px;"></i>
      </button>
      <button class="admin-action-btn results-btn" data-election-id="${election._id}" title="View Results">
        <i data-lucide="bar-chart-3" style="width:14px;height:14px;"></i>
      </button>
      <button class="admin-action-btn danger delete-btn" data-election-id="${election._id}" title="Delete">
        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
      </button>
    `;
    
    return `
      <tr>
        <td>
          <div class="cell-election">
            <div class="cell-avatar">${election.title.charAt(0)}</div>
            <div class="cell-info">
              <h4>${escapeHtml(election.title)}</h4>
              <p>${escapeHtml(truncateText(election.description, 40))}</p>
            </div>
          </div>
        </td>
        <td>${statusBadge} ${paymentBadge}</td>
        <td>${formatDate(election.startDate)} - ${formatDate(election.endDate)}</td>
        <td>${formatNumber(election.totalVotes)}</td>
        <td>${election.turnout || 0}%</td>
        <td>
          <div class="admin-action-btns">${actions}</div>
        </td>
      </tr>
    `;
  }).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // Attach event listeners to action buttons
  attachActionButtonListeners();
}

function attachPaginationListeners() {
  document.querySelectorAll('#pagination button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (!Number.isNaN(page)) loadElections(page);
    });
  });
}

function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container || !pagination || pagination.totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }
  
  let html = '';
  html += `<button data-page="${pagination.page - 1}" ${pagination.page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px;height:14px;"></i></button>`;
  
  for (let i = 1; i <= pagination.totalPages; i++) {
    if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 1 && i <= pagination.page + 1)) {
      html += `<button data-page="${i}" class="${i === pagination.page ? 'active' : ''}">${i}</button>`;
    } else if (i === pagination.page - 2 || i === pagination.page + 2) {
      html += '<span>...</span>';
    }
  }
  
  html += `<button data-page="${pagination.page + 1}" ${!pagination.hasNext ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px;height:14px;"></i></button>`;
  
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  attachPaginationListeners();
}

// Attach event listeners to action buttons (CSP-safe)
function attachActionButtonListeners() {
  // Edit button
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      editElection(electionId);
    });
  });
  
  // Activate button
  document.querySelectorAll('.activate-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      activateElection(electionId);
    });
  });
  
  // Pay button
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      initializePayment(electionId);
    });
  });
  
  // Close button
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      closeElection(electionId);
    });
  });
  
  // View Results button
  document.querySelectorAll('.results-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      window.location.href = 'results.html?id=' + electionId;
    });
  });
    // Manage Categories button
  document.querySelectorAll('.categories-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const electionId = btn.dataset.electionId;
      openCategoriesModal(electionId);
    });
  });
    // Delete button
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const electionId = this.dataset.electionId;
      confirmDeleteElection(electionId);
    });
  });
}

// Modal functions
function initElectionModals() {
  // Create/Edit Modal
  document.getElementById('createElectionBtn')?.addEventListener('click', openCreateElectionModal);
  document.getElementById('emptyStateCreateBtn')?.addEventListener('click', openCreateElectionModal);
  document.getElementById('closeElectionModal')?.addEventListener('click', closeElectionModal);
  document.getElementById('cancelElection')?.addEventListener('click', closeElectionModal);
  document.getElementById('saveElection')?.addEventListener('click', saveElection);
  
  // Export CSV button
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    exportTableToCSV('.admin-table', 'elections-export.csv');
  });
  
  // Delete Modal
  document.getElementById('closeDeleteModal')?.addEventListener('click', closeDeleteModal);
  document.getElementById('cancelDelete')?.addEventListener('click', closeDeleteModal);
  document.getElementById('confirmDelete')?.addEventListener('click', deleteElection);
  
  // Close modals on overlay click
  document.querySelectorAll('.admin-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.closest('.admin-modal')?.classList.add('hidden');
    });
  });
}

function openCreateElectionModal() {
  editingElectionId = null;
  document.getElementById('modalTitle').textContent = 'Create New Election';
  document.getElementById('saveElectionText').textContent = 'Create Election';
  document.getElementById('electionForm').reset();
  document.getElementById('electionModal').classList.remove('hidden');
}

function editElection(id) {
  const election = currentElections.find(e => e._id === id);
  if (!election) return;
  
  editingElectionId = id;
  document.getElementById('modalTitle').textContent = 'Edit Election';
  document.getElementById('saveElectionText').textContent = 'Save Changes';
  
  document.getElementById('electionTitle').value = election.title || '';
  document.getElementById('electionType').value = election.type || 'other';
  document.getElementById('electionDescription').value = election.description || '';
  document.getElementById('startDate').value = formatDateTimeLocal(election.startDate);
  document.getElementById('endDate').value = formatDateTimeLocal(election.endDate);
  
  document.getElementById('electionModal').classList.remove('hidden');
}

function closeElectionModal() {
  document.getElementById('electionModal').classList.add('hidden');
  editingElectionId = null;
}

function confirmDeleteElection(id) {
  deletingElectionId = id;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.add('hidden');
  deletingElectionId = null;
}

// Save election
async function saveElection() {
  const form = document.getElementById('electionForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const saveBtn = document.getElementById('saveElection');
  setButtonLoading(saveBtn, true);
  
  const electionData = {
    title: document.getElementById('electionTitle').value.trim(),
    type: document.getElementById('electionType').value,
    description: document.getElementById('electionDescription').value.trim(),
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
  };
  
  try {
    const url = editingElectionId ? `/elections/${editingElectionId}` : '/elections';
    const method = editingElectionId ? 'PUT' : 'POST';
    
    const response = await adminApiRequest(url, { method, body: electionData });
    
    if (response.success) {
      showAdminToast(editingElectionId ? 'Election updated!' : 'Election created!', 'success');
      closeElectionModal();
      loadElections(currentPage);
    } else {
      // Save to localStorage for demo
      saveElectionLocally(electionData);
      showAdminToast(editingElectionId ? 'Election updated locally!' : 'Election created!', 'success');
      closeElectionModal();
      loadLocalElections();
    }
  } catch (error) {
    // Save locally for demo
    saveElectionLocally(electionData);
    showAdminToast(editingElectionId ? 'Election updated locally!' : 'Election created!', 'success');
    closeElectionModal();
    loadLocalElections();
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

function saveElectionLocally(data) {
  let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
  
  if (editingElectionId) {
    const index = elections.findIndex(e => e._id === editingElectionId);
    if (index !== -1) {
      elections[index] = { ...elections[index], ...data };
    }
  } else {
    elections.push({
      _id: generateMockObjectId(),
      ...data,
      status: 'draft',
      totalVotes: 0,
      turnout: 0,
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(),
    });
  }
  
  localStorage.setItem('votewave_elections', JSON.stringify(elections));
}

// Delete election
async function deleteElection() {
  if (!deletingElectionId) return;
  
  const confirmBtn = document.getElementById('confirmDelete');
  setButtonLoading(confirmBtn, true);
  
  try {
    const response = await adminApiRequest(`/elections/${deletingElectionId}`, { method: 'DELETE' });
    if (response.success) {
      showAdminToast('Election deleted!', 'success');
    }
  } catch (error) {
    // Delete from localStorage
    let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
    elections = elections.filter(e => e._id !== deletingElectionId);
    localStorage.setItem('votewave_elections', JSON.stringify(elections));
    showAdminToast('Election deleted!', 'success');
  } finally {
    closeDeleteModal();
    loadElections(currentPage);
    setButtonLoading(confirmBtn, false);
  }
}

// Activate election
async function activateElection(id) {
  try {
    await adminApiRequest(`/admin/elections/${id}/activate`, { method: 'POST' });
    showAdminToast('Election activated!', 'success');
    loadElections(currentPage);
  } catch (error) {
    // Update locally
    let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
    const index = elections.findIndex(e => e._id === id);
    if (index !== -1) elections[index].status = 'active';
    localStorage.setItem('votewave_elections', JSON.stringify(elections));
    showAdminToast('Election activated!', 'success');
    loadElections(currentPage);
  }
}

// Close election
async function closeElection(id) {
  if (!confirmAction('Close this election? Voters will no longer be able to cast votes.')) return;
  
  try {
    await adminApiRequest(`/admin/elections/${id}/close`, { method: 'POST' });
    showAdminToast('Election closed!', 'success');
    loadElections(currentPage);
  } catch (error) {
    let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
    const index = elections.findIndex(e => e._id === id);
    if (index !== -1) elections[index].status = 'completed';
    localStorage.setItem('votewave_elections', JSON.stringify(elections));
    showAdminToast('Election closed!', 'success');
    loadElections(currentPage);
  }
}

// Payment initialization
async function initializePayment(id) {
  showAdminToast('Redirecting to payment gateway...', 'info');
  // Simulate payment
  setTimeout(() => {
    let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
    const index = elections.findIndex(e => e._id === id);
    if (index !== -1) elections[index].paymentStatus = 'paid';
    localStorage.setItem('votewave_elections', JSON.stringify(elections));
    showAdminToast('Payment successful! You can now activate the election.', 'success');
    loadElections(currentPage);
  }, 2000);
}

// Filters
function initElectionFilters() {
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  
  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadElections(1), 300);
  });
  
  statusFilter?.addEventListener('change', () => loadElections(1));
}

function initElectionFormButtons() {
  // Set default dates
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  if (startDateInput && !startDateInput.value) {
    startDateInput.value = formatDateTimeLocal(now);
  }
  if (endDateInput && !endDateInput.value) {
    endDateInput.value = formatDateTimeLocal(later);
  }
}

// Format date helper
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Expose functions globally
window.loadElections = loadElections;
window.editElection = editElection;
window.confirmDeleteElection = confirmDeleteElection;
window.saveElection = saveElection;
window.deleteElection = deleteElection;
window.activateElection = activateElection;
window.closeElection = closeElection;
window.initializePayment = initializePayment;
window.openCreateElectionModal = openCreateElectionModal;

// Category Management
let currentElectionId = null;
let currentCategoryId = null;
let currentCategoryIndex = null;

function openCategoriesModal(electionId) {
  currentElectionId = electionId;
  document.getElementById('categoriesModal').classList.remove('hidden');
  loadCategories(electionId);
}

function closeCategoriesModal() {
  document.getElementById('categoriesModal').classList.add('hidden');
  currentElectionId = null;
}

function updateLocalStorage() {
  localStorage.setItem('votewave_elections', JSON.stringify(currentElections));
}

async function loadCategories(electionId) {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  try {
    // Try to load from API first
    const response = await adminApiRequest(`/elections/${electionId}`);
    if (response.success && response.data.categories) {
      // Update local data with API data
      const electionIndex = currentElections.findIndex(e => e._id === electionId);
      if (electionIndex !== -1) {
        currentElections[electionIndex].categories = response.data.categories;
        updateLocalStorage();
      }
    }
  } catch (error) {
    console.log('Loading categories from localStorage', error);
  }

  // Load from local data
  const election = currentElections.find(e => e._id === electionId);
  if (!election) return;

  const categories = election.categories || [];
  
  container.innerHTML = categories.length === 0 
    ? '<p style="text-align:center;color:var(--admin-text-muted);">No categories yet. Add your first category below.</p>'
    : categories.map((cat, index) => `
        <div class="category-item">
          <div class="category-header">
            <h4>${escapeHtml(cat.name)}</h4>
            <div class="category-actions">
              <button class="admin-action-btn" onclick="manageNominees('${electionId}', ${index})" title="Manage Nominees">
                <i data-lucide="users" style="width:14px;height:14px;"></i>
              </button>
              <button class="admin-action-btn" onclick="editCategory('${electionId}', ${index})" title="Edit">
                <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
              </button>
              <button class="admin-action-btn danger" onclick="deleteCategory('${electionId}', ${index})" title="Delete">
                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
              </button>
            </div>
          </div>
          <p>${escapeHtml(cat.description || '')}</p>
          <small>Max votes: ${cat.maxVotes || 1} | Required: ${cat.required ? 'Yes' : 'No'} | Nominees: ${cat.nominees ? cat.nominees.length : 0}</small>
        </div>
      `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openCategoryModal(categoryIndex = null) {
  currentCategoryIndex = categoryIndex;
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  const form = document.getElementById('categoryForm');
  
  if (categoryIndex !== null) {
    const election = currentElections.find(e => e._id === currentElectionId);
    const category = election.categories[categoryIndex];
    title.textContent = 'Edit Category';
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryDescription').value = category.description || '';
    document.getElementById('maxVotes').value = category.maxVotes || 1;
    document.getElementById('categoryRequired').checked = category.required !== false;
  } else {
    title.textContent = 'Add Category';
    form.reset();
  }
  
  modal.classList.remove('hidden');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.add('hidden');
  currentCategoryIndex = null;
}

async function saveCategory() {
  const form = document.getElementById('categoryForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const categoryData = {
    name: document.getElementById('categoryName').value.trim(),
    description: document.getElementById('categoryDescription').value.trim(),
    maxVotes: parseInt(document.getElementById('maxVotes').value) || 1,
    required: document.getElementById('categoryRequired').checked,
  };
  
  try {
    if (currentCategoryIndex !== null) {
      // Update existing category
      const election = currentElections.find(e => e._id === currentElectionId);
      const categoryId = election.categories[currentCategoryIndex]._id;
      
      const response = await adminApiRequest(`/elections/${currentElectionId}/categories/${categoryId}`, {
        method: 'PUT',
        body: JSON.stringify(categoryData)
      });
      
      if (response.success) {
        // Update local data
        election.categories[currentCategoryIndex] = { ...election.categories[currentCategoryIndex], ...categoryData };
        updateLocalStorage();
        showAdminToast('Category updated!', 'success');
      } else {
        throw new Error(response.message || 'Failed to update category');
      }
    } else {
      // Add new category
      const response = await adminApiRequest(`/elections/${currentElectionId}/categories`, {
        method: 'POST',
        body: JSON.stringify(categoryData)
      });
      
      if (response.success) {
        // Update local data
        const election = currentElections.find(e => e._id === currentElectionId);
        if (!election.categories) election.categories = [];
        election.categories.push(response.data);
        updateLocalStorage();
        showAdminToast('Category added!', 'success');
      } else {
        throw new Error(response.message || 'Failed to add category');
      }
    }
    
    closeCategoryModal();
    loadCategories(currentElectionId);
  } catch (error) {
    console.error('Error saving category:', error);
    showAdminToast('Failed to save category: ' + error.message, 'error');
  }
}

async function deleteCategory(electionId, categoryIndex) {
  if (!confirmAction('Delete this category? All nominees will be removed.')) return;
  
  try {
    const election = currentElections.find(e => e._id === electionId);
    const categoryId = election.categories[categoryIndex]._id;
    
    const response = await adminApiRequest(`/elections/${electionId}/categories/${categoryId}`, {
      method: 'DELETE'
    });
    
    if (response.success) {
      // Update local data
      election.categories.splice(categoryIndex, 1);
      updateLocalStorage();
      loadCategories(electionId);
      showAdminToast('Category deleted!', 'success');
    } else {
      throw new Error(response.message || 'Failed to delete category');
    }
  } catch (error) {
    console.error('Error deleting category:', error);
    showAdminToast('Failed to delete category: ' + error.message, 'error');
  }
}

function manageNominees(electionId, categoryIndex) {
  currentElectionId = electionId;
  currentCategoryIndex = categoryIndex;
  document.getElementById('nomineesModalTitle').textContent = `Manage Nominees - ${currentElections.find(e => e._id === electionId).categories[categoryIndex].name}`;
  document.getElementById('nomineesModal').classList.remove('hidden');
  loadNominees(electionId, categoryIndex);
}

function closeNomineesModal() {
  document.getElementById('nomineesModal').classList.add('hidden');
  currentCategoryIndex = null;
}

async function loadNominees(electionId, categoryIndex) {
  const container = document.getElementById('nomineesList');
  if (!container) return;

  const election = currentElections.find(e => e._id === electionId);
  if (!election || !election.categories[categoryIndex]) return;

  const nominees = election.categories[categoryIndex].nominees || [];
  
  if (nominees.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--admin-text-muted);">No nominees yet. Add your first nominee below.</p>';
    return;
  }

  // Get candidate data
  let candidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
  
  // Try to fetch from API if not in localStorage
  try {
    const response = await adminApiRequest(`/candidates?election=${electionId}`);
    if (response.success && response.data) {
      candidates = response.data;
      localStorage.setItem('votewave_candidates', JSON.stringify(candidates));
    }
  } catch (error) {
    console.log('Loading nominees from localStorage', error);
  }

  container.innerHTML = nominees.map(nomineeId => {
    const candidate = candidates.find(c => c._id === nomineeId);
    if (!candidate) return `<div class="nominee-item">Unknown nominee (ID: ${nomineeId})</div>`;
    
    return `
      <div class="nominee-item">
        <div class="nominee-header">
          <div class="nominee-avatar">
            ${candidate.photo ? `<img src="${candidate.photo}" alt="${candidate.name}">` : candidate.name.charAt(0)}
          </div>
          <div class="nominee-info">
            <h4>${escapeHtml(candidate.name)}</h4>
            ${candidate.position ? `<p>${escapeHtml(candidate.position)}</p>` : ''}
          </div>
          <button class="admin-action-btn danger" onclick="removeNominee('${electionId}', '${election.categories[categoryIndex]._id}', '${nomineeId}')" title="Remove">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
        </div>
        ${candidate.bio ? `<p class="nominee-bio">${escapeHtml(candidate.bio)}</p>` : ''}
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openNomineeModal() {
  document.getElementById('nomineeModal').classList.remove('hidden');
}

function closeNomineeModal() {
  document.getElementById('nomineeModal').classList.add('hidden');
}

async function saveNominee() {
  const form = document.getElementById('nomineeForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const nomineeData = {
    name: document.getElementById('nomineeName').value.trim(),
    bio: document.getElementById('nomineeBio').value.trim(),
    photo: document.getElementById('nomineePhoto').value.trim(),
    position: document.getElementById('nomineePosition').value.trim(),
  };
  
  try {
    const election = currentElections.find(e => e._id === currentElectionId);
    const categoryId = election.categories[currentCategoryIndex]._id;
    
    const response = await adminApiRequest(`/elections/${currentElectionId}/categories/${categoryId}/nominees`, {
      method: 'POST',
      body: JSON.stringify(nomineeData)
    });
    
    if (response.success) {
      // Update local data
      const category = election.categories[currentCategoryIndex];
      if (!category.nominees) category.nominees = [];
      category.nominees.push(response.data._id);
      
      // Store candidate data locally for display
      let candidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
      candidates.push(response.data);
      localStorage.setItem('votewave_candidates', JSON.stringify(candidates));
      
      updateLocalStorage();
      closeNomineeModal();
      loadNominees(currentElectionId, currentCategoryIndex);
      showAdminToast('Nominee added!', 'success');
    } else {
      throw new Error(response.message || 'Failed to add nominee');
    }
  } catch (error) {
    console.error('Error saving nominee:', error);
    showAdminToast('Failed to add nominee: ' + error.message, 'error');
  }
}

async function removeNominee(electionId, categoryId, nomineeId) {
  if (!confirmAction('Remove this nominee from the category?')) return;
  
  try {
    const response = await adminApiRequest(`/elections/${electionId}/categories/${categoryId}/nominees/${nomineeId}`, {
      method: 'DELETE'
    });
    
    if (response.success) {
      // Update local data
      const election = currentElections.find(e => e._id === electionId);
      const category = election.categories.find(cat => cat._id === categoryId);
      if (category && category.nominees) {
        category.nominees = category.nominees.filter(id => id !== nomineeId);
      }
      
      // Remove from candidates localStorage
      let candidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
      candidates = candidates.filter(c => c._id !== nomineeId);
      localStorage.setItem('votewave_candidates', JSON.stringify(candidates));
      
      updateLocalStorage();
      loadNominees(electionId, currentCategoryIndex);
      showAdminToast('Nominee removed!', 'success');
    } else {
      throw new Error(response.message || 'Failed to remove nominee');
    }
  } catch (error) {
    console.error('Error removing nominee:', error);
    showAdminToast('Failed to remove nominee: ' + error.message, 'error');
  }
}

// Initialize category modals
function initCategoryModals() {
  // Categories modal
  document.getElementById('closeCategoriesModal')?.addEventListener('click', closeCategoriesModal);
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryModal());
  
  // Category modal
  document.getElementById('closeCategoryModal')?.addEventListener('click', closeCategoryModal);
  document.getElementById('cancelCategory')?.addEventListener('click', closeCategoryModal);
  document.getElementById('saveCategory')?.addEventListener('click', saveCategory);
  
  // Nominees modal
  document.getElementById('closeNomineesModal')?.addEventListener('click', closeNomineesModal);
  document.getElementById('addNomineeBtn')?.addEventListener('click', openNomineeModal);
  
  // Nominee modal
  document.getElementById('closeNomineeModal')?.addEventListener('click', closeNomineeModal);
  document.getElementById('cancelNominee')?.addEventListener('click', closeNomineeModal);
  document.getElementById('saveNominee')?.addEventListener('click', saveNominee);
  
  // Close modals on overlay click
  document.querySelectorAll('#categoriesModal .admin-modal-overlay, #categoryModal .admin-modal-overlay, #nomineesModal .admin-modal-overlay, #nomineeModal .admin-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.closest('.admin-modal').classList.add('hidden');
    });
  });
}

// Call initCategoryModals in initElectionsPage
function initElectionsPage() {
  loadElections();
  initElectionModals();
  initElectionFilters();
  initElectionFormButtons();
  initCategoryModals();
  checkUrlParams();
}