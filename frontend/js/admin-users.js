/**
 * VoteWave - Admin Users Management
 * Complete user CRUD, ban, role management
 */

let currentUsers = [];
let editingUserId = null;
let banningUserId = null;
let deletingUserId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  initUserModals();
});

function loadUsers(role = 'all') {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  // Get users from localStorage + sample data
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  
  if (users.length === 0) {
    users = [
      { _id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', role: 'voter', status: 'active', createdAt: '2026-01-15', totalVotes: 5 },
      { _id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', role: 'admin', status: 'active', createdAt: '2026-01-20', totalVotes: 12 },
      { _id: '3', firstName: 'Mike', lastName: 'King', email: 'mike@example.com', role: 'voter', status: 'banned', createdAt: '2026-02-01', totalVotes: 0, banReason: 'Violation of voting policy' },
      { _id: '4', firstName: 'Sarah', lastName: 'Davis', email: 'sarah@example.com', role: 'voter', status: 'pending', createdAt: '2026-02-15', totalVotes: 0 },
      { _id: '5', firstName: 'Super', lastName: 'Admin', email: 'admin@votewave.com', role: 'superadmin', status: 'active', createdAt: '2026-01-01', totalVotes: 0 },
    ];
  }
  
  const statusFilter = document.getElementById('statusFilter')?.value;
  const searchQuery = document.getElementById('searchInput')?.value?.toLowerCase();
  
  let filtered = users;
  if (role !== 'all') filtered = filtered.filter(u => u.role === role);
  if (statusFilter) filtered = filtered.filter(u => u.status === statusFilter);
  if (searchQuery) filtered = filtered.filter(u => 
    u.firstName.toLowerCase().includes(searchQuery) || 
    u.lastName.toLowerCase().includes(searchQuery) || 
    u.email.toLowerCase().includes(searchQuery)
  );
  
  currentUsers = filtered;
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty-state"><i data-lucide="users"></i><h3>No users found</h3></div></td></tr>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  
  tbody.innerHTML = filtered.map(user => {
    const statusBadge = user.status === 'banned' 
      ? '<span class="admin-badge error">BANNED</span>'
      : user.status === 'pending' 
        ? '<span class="admin-badge pending">Pending</span>'
        : '<span class="admin-badge active">Active</span>';
    
    const roleBadge = `<span class="role-badge ${user.role}">${user.role}</span>`;
    
    let actions = `
      <button class="admin-action-btn" onclick="editUser('${user._id}')" title="Edit"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
    `;
    
    if (user.status === 'banned') {
      actions += `<button class="admin-action-btn success" onclick="unbanUser('${user._id}')" title="Unban"><i data-lucide="unlock" style="width:14px;height:14px;"></i></button>`;
    } else {
      actions += `<button class="admin-action-btn warning" onclick="openBanModal('${user._id}')" title="Ban"><i data-lucide="ban" style="width:14px;height:14px;"></i></button>`;
    }
    
    actions += `
      <button class="admin-action-btn" onclick="changeRole('${user._id}','${user.role}')" title="Change Role"><i data-lucide="shield" style="width:14px;height:14px;"></i></button>
      <button class="admin-action-btn danger" onclick="confirmDeleteUser('${user._id}')" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
    `;
    
    return `
      <tr class="${user.status === 'banned' ? 'banned' : ''}">
        <td>
          <div class="cell-user">
            <div class="cell-avatar ${user.status === 'banned' ? 'banned' : ''}">${user.firstName[0]}${user.lastName[0]}</div>
            <div class="cell-info">
              <h4>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</h4>
              <p>${escapeHtml(user.email)}</p>
              ${user.banReason ? `<p style="color:#ef4444;font-size:0.75rem;">Reason: ${escapeHtml(user.banReason)}</p>` : ''}
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(user.createdAt)}</td>
        <td>${user.totalVotes || 0}</td>
        <td><div class="admin-action-btns">${actions}</div></td>
      </tr>
    `;
  }).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initUserModals() {
  document.getElementById('saveUserBtn')?.addEventListener('click', saveUser);
  document.getElementById('confirmBan')?.addEventListener('click', banUser);
  document.getElementById('confirmDelete')?.addEventListener('click', deleteUser);
}

function editUser(id) {
  const user = currentUsers.find(u => u._id === id);
  if (!user) return;
  
  editingUserId = id;
  document.getElementById('editFirstName').value = user.firstName;
  document.getElementById('editLastName').value = user.lastName;
  document.getElementById('editEmail').value = user.email;
  document.getElementById('editRole').value = user.role;
  document.getElementById('saveUserBtn').textContent = 'Save Changes';
  document.getElementById('editUserModal').classList.remove('hidden');
}

function saveUser() {
  const userData = {
    firstName: document.getElementById('editFirstName').value.trim(),
    lastName: document.getElementById('editLastName').value.trim(),
    email: document.getElementById('editEmail').value.trim(),
    role: document.getElementById('editRole').value,
  };
  
  if (!userData.firstName || !userData.lastName || !userData.email) {
    showAdminToast('Please fill all fields', 'error');
    return;
  }
  
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  
  if (editingUserId) {
    const index = users.findIndex(u => u._id === editingUserId);
    if (index !== -1) users[index] = { ...users[index], ...userData };
  } else {
    users.push({
      _id: Date.now().toString(),
      ...userData,
      status: 'active',
      createdAt: new Date().toISOString(),
      totalVotes: 0,
    });
  }
  
  localStorage.setItem('votewave_users', JSON.stringify(users));
  document.getElementById('editUserModal').classList.add('hidden');
  editingUserId = null;
  showAdminToast(editingUserId ? 'User updated!' : 'User added!', 'success');
  loadUsers();
}

function openBanModal(id) {
  banningUserId = id;
  document.getElementById('banModal').classList.remove('hidden');
}

function banUser() {
  const reason = document.getElementById('banReason').value.trim();
  if (!reason) {
    showAdminToast('Please provide a reason', 'error');
    return;
  }
  
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  const index = users.findIndex(u => u._id === banningUserId);
  if (index !== -1) {
    users[index].status = 'banned';
    users[index].banReason = reason;
  }
  
  localStorage.setItem('votewave_users', JSON.stringify(users));
  document.getElementById('banModal').classList.add('hidden');
  banningUserId = null;
  showAdminToast('User banned', 'success');
  loadUsers();
}

function unbanUser(id) {
  if (!confirm('Unban this user?')) return;
  
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  const index = users.findIndex(u => u._id === id);
  if (index !== -1) {
    users[index].status = 'active';
    delete users[index].banReason;
  }
  
  localStorage.setItem('votewave_users', JSON.stringify(users));
  showAdminToast('User unbanned', 'success');
  loadUsers();
}

function changeRole(id, currentRole) {
  const roles = ['voter', 'admin', 'superadmin'];
  const currentIndex = roles.indexOf(currentRole);
  const newRole = roles[(currentIndex + 1) % roles.length];
  
  if (!confirm(`Change role from ${currentRole} to ${newRole}?`)) return;
  
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  const index = users.findIndex(u => u._id === id);
  if (index !== -1) users[index].role = newRole;
  
  localStorage.setItem('votewave_users', JSON.stringify(users));
  showAdminToast(`Role changed to ${newRole}`, 'success');
  loadUsers();
}

function confirmDeleteUser(id) {
  deletingUserId = id;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function deleteUser() {
  let users = JSON.parse(localStorage.getItem('votewave_users') || '[]');
  users = users.filter(u => u._id !== deletingUserId);
  localStorage.setItem('votewave_users', JSON.stringify(users));
  
  document.getElementById('deleteModal').classList.add('hidden');
  deletingUserId = null;
  showAdminToast('User deleted', 'success');
  loadUsers();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

window.editUser = editUser;
window.openBanModal = openBanModal;
window.unbanUser = unbanUser;
window.changeRole = changeRole;
window.confirmDeleteUser = confirmDeleteUser;
window.saveUser = saveUser;
window.banUser = banUser;
window.deleteUser = deleteUser;
window.loadUsers = loadUsers;