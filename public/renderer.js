const DEPARTMENT_ROOTS = [
  'human_resources',
  'procurement',
  'operation',
  'inventory',
  'project_tender',
  'hse',
  'logistics',
  'tba'
];

const DEPARTMENT_TITLES = {
  human_resources: 'Human Resources',
  procurement: 'Procurement',
  operation: 'Operation',
  inventory: 'Inventory',
  project_tender: 'Project / Tender',
  hse: 'HSE',
  logistics: 'Logistics',
  tba: 'TBA'
};

const folderLimit = 20;

function joinPath(base, name) {
  if (!base) return name || '';
  if (!name) return base || '';
  return `${base}/${name}`.replace(/\/+/g, '/');
}

function dirname(value) {
  if (!value) return '';
  const parts = value.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function basename(value) {
  return String(value || '').split('/').filter(Boolean).pop() || '';
}

function getRelativeDepth(folderPath) {
  if (!folderPath) return 1;
  return folderPath.split('/').filter(Boolean).length + 1;
}

function getExt(fileName) {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function getFileIcon(fileName) {
  const ext = getExt(fileName);
  if (['.pdf'].includes(ext)) return '📕';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '📊';
  if (['.doc', '.docx'].includes(ext)) return '📄';
  if (['.ppt', '.pptx'].includes(ext)) return '📙';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return '🖼️';
  return '📄';
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
if (response.status === 401) {

  window.location.href = '/';

  throw new Error('Not logged in.');
}

if (!response.ok || data.success === false) {
  throw new Error(data.message || 'Action failed.');
}
  return data;
}

window.addEventListener('beforeunload', async () => {
  try {
    navigator.sendBeacon('/api/logout');
  } catch (e) {}
});

document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('login-form');
  const loginDetailsForm = document.getElementById('login-details-form');
  const loginError = document.getElementById('login-error');
  const departmentSection = document.getElementById('department-section');
  const departmentForm = document.getElementById('department-form');
  const logoutBtn = document.getElementById('logout-btn');
  const departmentImage = document.getElementById('department-image');
  const welcomeMessage = document.getElementById('welcome-message');
  const departmentOutput = document.getElementById('department-output');
  const breadcrumb = document.getElementById('breadcrumb');
  const refreshBtn = document.getElementById('refresh-btn');
  const backBtn = document.getElementById('back-btn');
  const backHomeBtn = document.getElementById('back-home-btn');
  const departmentButtonsPanel = document.querySelector('.department-buttons');
  const contextMenu = document.getElementById('context-menu');

  const restoreBtn = document.createElement('button');
  restoreBtn.id = 'restore-btn';
  restoreBtn.type = 'button';
  restoreBtn.textContent = 'Restore Deleted';
  backHomeBtn.insertAdjacentElement('afterend', restoreBtn);

  const selectBtn = document.createElement('button');
  selectBtn.id = 'select-btn';
  selectBtn.type = 'button';
  selectBtn.textContent = 'Select';
  restoreBtn.insertAdjacentElement('afterend', selectBtn);

  const bulkDeleteBtn = document.createElement('button');
  bulkDeleteBtn.id = 'bulk-delete-btn';
  bulkDeleteBtn.type = 'button';
  bulkDeleteBtn.textContent = 'Delete Selected';
  bulkDeleteBtn.style.display = 'none';
  selectBtn.insertAdjacentElement('afterend', bulkDeleteBtn);

  let currentDepartmentRoot = '';
  let currentFolder = '';
  let currentTitle = '';
  let isSelectMode = false;
  const selectedItems = new Set();

  departmentSection.style.display = 'none';
  departmentForm.style.display = 'none';
  hideContextMenu();

  checkSession();

  async function checkSession() {
    try {
      const result = await apiJson('/api/session');
      if (result.loggedIn) {
        loginForm.style.display = 'none';
        departmentSection.style.display = 'block';
        welcomeMessage.style.display = 'block';
        departmentImage.style.display = 'block';
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
  }

  loginDetailsForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    loginError.style.display = 'none';

    try {
      await apiJson('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      });

      loginForm.style.display = 'none';
      departmentSection.style.display = 'block';
      welcomeMessage.style.display = 'block';
      departmentImage.style.display = 'block';
    } catch (error) {
      loginError.textContent = error.message;
loginError.style.display = 'block';
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try {
      await apiJson('/api/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (error) {
      console.error('Logout failed:', error);
    }

    departmentSection.style.display = 'none';
    departmentForm.style.display = 'none';
    loginForm.style.display = 'block';
    loginError.style.display = 'none';
    departmentOutput.innerHTML = '';
    currentDepartmentRoot = '';
    currentFolder = '';
    currentTitle = '';
    resetSelectMode();
    hideContextMenu();
  });

  const homepageBtn = document.getElementById('homepage-btn');
  homepageBtn.addEventListener('click', showHomepage);
  backHomeBtn.addEventListener('click', showHomepage);
  restoreBtn.addEventListener('click', showTrashList);
  selectBtn.addEventListener('click', toggleSelectMode);
  bulkDeleteBtn.addEventListener('click', bulkDeleteSelectedItems);

  function showHomepage() {
    departmentSection.style.display = 'block';
    departmentForm.style.display = 'none';
    departmentButtonsPanel.style.display = 'grid';
    welcomeMessage.style.display = 'block';
    departmentImage.style.display = 'block';
    departmentOutput.innerHTML = '';
    currentDepartmentRoot = '';
    currentFolder = '';
    currentTitle = '';
    resetSelectMode();
    hideContextMenu();
  }

  const buttons = {
    hr: { button: document.getElementById('hr-btn'), folder: 'human_resources', title: 'Human Resources' },
    procurement: { button: document.getElementById('procurement-btn'), folder: 'procurement', title: 'Procurement' },
    operation: { button: document.getElementById('operation-btn'), folder: 'operation', title: 'Operation' },
    inventory: { button: document.getElementById('inventory-btn'), folder: 'inventory', title: 'Inventory' },
    project: { button: document.getElementById('project-btn'), folder: 'project_tender', title: 'Project / Tender' },
    hse: { button: document.getElementById('hse-btn'), folder: 'hse', title: 'HSE' },
    logistics: { button: document.getElementById('logistics-btn'), folder: 'logistics', title: 'Logistics' },
    tba: { button: document.getElementById('tba-btn'), folder: 'tba', title: 'TBA' }
  };

  Object.keys(buttons).forEach((key) => {
    const btnConfig = buttons[key];
    btnConfig.button.addEventListener('click', function () {
      currentDepartmentRoot = btnConfig.folder;
      currentFolder = '';
      currentTitle = btnConfig.title;
      departmentForm.style.display = 'block';
      departmentButtonsPanel.style.display = 'none';
      document.getElementById('department-title').textContent = `${btnConfig.title} Folder & File Management`;
      welcomeMessage.style.display = 'none';
      departmentImage.style.display = 'none';
      resetSelectMode();
      loadCurrentFolder();
    });
  });

  refreshBtn.addEventListener('click', loadCurrentFolder);
  backBtn.addEventListener('click', function () {
    if (!currentFolder) return;
    currentFolder = dirname(currentFolder);
    loadCurrentFolder();
  });

  departmentOutput.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    const row = event.target.closest('.explorer-item');
    if (row) return;
    showContextMenu(event.pageX, event.pageY, [
      { label: 'Upload File', action: () => uploadFilesToFolder(currentFolder) },
      { label: 'Upload Folder', action: () => uploadFolderToFolder(currentFolder) },
      { label: 'Create Folder', action: () => createFolderIn(currentFolder) },
      { label: 'Download This Folder', action: () => downloadItem(currentFolder) },
      { label: 'Restore Deleted Items', action: () => showTrashList() }
    ]);
  });

  document.addEventListener('click', hideContextMenu);
  window.addEventListener('blur', hideContextMenu);

  function resetSelectMode() {
    isSelectMode = false;
    selectedItems.clear();
    selectBtn.textContent = 'Select';
    bulkDeleteBtn.style.display = 'none';
    bulkDeleteBtn.textContent = 'Delete Selected';
  }

  function toggleSelectMode() {
    if (!currentDepartmentRoot) return;
    isSelectMode = !isSelectMode;
    selectedItems.clear();
    selectBtn.textContent = isSelectMode ? 'Cancel Select' : 'Select';
    bulkDeleteBtn.style.display = isSelectMode ? 'inline-block' : 'none';
    updateBulkDeleteButton();
    loadCurrentFolder();
  }

  function updateBulkDeleteButton() {
    bulkDeleteBtn.textContent = selectedItems.size > 0 ? `Delete Selected (${selectedItems.size})` : 'Delete Selected';
    bulkDeleteBtn.disabled = selectedItems.size === 0;
  }

  function cleanupFloatingLayers() {
    hideContextMenu();
    document.querySelectorAll('.name-overlay, .confirm-overlay, .message-overlay').forEach((layer) => {
      try { layer.remove(); } catch (error) { console.error('Failed to remove floating layer:', error); }
    });
  }

  async function loadCurrentFolder() {
    hideContextMenu();
    if (!isSelectMode) selectedItems.clear();
    updateBulkDeleteButton();
    if (!currentDepartmentRoot) return;

    try {
      const result = await apiJson(`/api/list?department=${encodeURIComponent(currentDepartmentRoot)}&path=${encodeURIComponent(currentFolder)}`);
      const items = result.items || [];

      breadcrumb.textContent = getBreadcrumbText();
      backBtn.disabled = !currentFolder;
      departmentOutput.innerHTML = '';

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-folder';
        empty.textContent = isSelectMode ? 'This folder is empty.' : 'This folder is empty. Right click here to upload file, upload folder, or create folder.';
        departmentOutput.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      items.forEach((item) => renderExplorerItem(item, fragment));
      departmentOutput.appendChild(fragment);
    } catch (error) {
      await showMessage('Load Folder', error.message);
    }
  }

  function renderExplorerItem(item, container = departmentOutput) {
    const itemPath = joinPath(currentFolder, item.name);
    const itemDiv = document.createElement('div');
    itemDiv.className = 'explorer-item';
    itemDiv.tabIndex = 0;
    itemDiv.dataset.path = itemPath;
    itemDiv.dataset.type = item.isFolder ? 'folder' : 'file';

    if (isSelectMode) itemDiv.classList.add('select-mode');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'item-select-checkbox';
    checkbox.checked = selectedItems.has(itemPath);
    checkbox.style.display = isSelectMode ? 'block' : 'none';
    checkbox.addEventListener('click', function (event) { event.stopPropagation(); });
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) selectedItems.add(itemPath);
      else selectedItems.delete(itemPath);
      updateBulkDeleteButton();
    });

    const icon = document.createElement('span');
    icon.className = 'item-icon';
    icon.textContent = item.isFolder ? '📁' : getFileIcon(item.name);

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;

    const type = document.createElement('span');
    type.className = 'item-type';
    type.textContent = item.isFolder ? 'Folder' : (getExt(item.name).replace('.', '').toUpperCase() || 'File');

    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(icon);
    itemDiv.appendChild(name);
    itemDiv.appendChild(type);

    itemDiv.addEventListener('click', function (event) {
      if (!isSelectMode || event.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

  itemDiv.addEventListener('dblclick', function () {
  if (isSelectMode) return;

  if (item.isFolder) {
    openFolder(itemPath);
    return;
  }

  const ext = getExt(item.name);

  if (
    ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)
  ) {
    previewFile(itemPath, item.name);
  } else {
    downloadItem(itemPath);
  }
});

    itemDiv.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (isSelectMode) return;
      const menuItems = item.isFolder
        ? [
            { label: 'Open Folder', action: () => openFolder(itemPath) },
            { label: 'Upload File Here', action: () => uploadFilesToFolder(itemPath) },
            { label: 'Upload Folder Here', action: () => uploadFolderToFolder(itemPath) },
            { label: 'Download Folder as ZIP', action: () => downloadItem(itemPath) },
            { label: 'Rename Folder', action: () => renameItem(itemPath) },
            { label: 'Delete Folder', action: () => deleteItem(itemPath, true) }
          ]
        : [
            { label: 'Download File', action: () => downloadItem(itemPath) },
            { label: 'Rename File', action: () => renameItem(itemPath) },
            { label: 'Delete File', action: () => deleteItem(itemPath, false) }
          ];
      showContextMenu(event.pageX, event.pageY, menuItems);
    });

    container.appendChild(itemDiv);
  }

  function openFolder(folderPath) {
    if (getRelativeDepth(folderPath) > folderLimit) {
      showMessage('Open Folder', 'Maximum folder depth reached.');
      return;
    }
    currentFolder = folderPath;
    resetSelectMode();
    loadCurrentFolder();
  }

  function downloadItem(itemPath) {
  const fileUrl = `/api/download?department=${encodeURIComponent(currentDepartmentRoot)}&path=${encodeURIComponent(itemPath || '')}`;

  const downloadWindow = window.open(fileUrl, '_blank');

  if (!downloadWindow) {
    showMessage('Download', 'Popup blocked. Please allow popups for this website.');
  }
}

  async function uploadFilesToFolder(folderPath) {
    if (!currentDepartmentRoot) return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.addEventListener('change', async function () {
      if (!fileInput.files || fileInput.files.length === 0) return;
      await uploadFileList(fileInput.files, folderPath, false);
    });
    fileInput.click();
  }

  async function uploadFolderToFolder(folderPath) {
    if (!currentDepartmentRoot) return;
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.webkitdirectory = true;
    folderInput.addEventListener('change', async function () {
      if (!folderInput.files || folderInput.files.length === 0) return;
      await uploadFileList(folderInput.files, folderPath, true);
    });
    folderInput.click();
  }

  async function uploadFileList(files, parentPath, useRelativePath) {
    try {
      const formData = new FormData();
      formData.append('department', currentDepartmentRoot);
      formData.append('parentPath', parentPath || '');
      Array.from(files).forEach((file) => {
        formData.append('files', file, file.name);
        formData.append('relativePaths', useRelativePath ? (file.webkitRelativePath || file.name) : file.name);
      });

      const response = await fetch('/api/upload', { method: 'POST', credentials: 'same-origin', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.message || 'Upload failed.');
      await loadCurrentFolder();

requestAnimationFrame(() => {
  showMessage('Upload', 'Upload completed successfully.');
});
    } catch (error) {
      await showMessage('Upload', error.message);
    }
  }

  async function createFolderIn(parentFolder) {
    cleanupFloatingLayers();
    if (!currentDepartmentRoot) {
      await showMessage('Create Folder', 'Please select a department first.');
      return;
    }

    const folderName = await askForName('Create Folder', '');
    if (!folderName || !folderName.trim()) return;

    try {
      await apiJson('/api/create-folder', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, parentPath: parentFolder || '', folderName: folderName.trim() })
      });
      await loadCurrentFolder();
    } catch (error) {
      await showMessage('Create Folder', error.message);
    }
  }

  async function renameItem(itemPath) {
    cleanupFloatingLayers();
    const oldName = basename(itemPath);
    const newName = await askForName('Rename', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    try {
      await apiJson('/api/rename', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, itemPath, newName: newName.trim() })
      });
      await loadCurrentFolder();
    } catch (error) {
      await showMessage('Rename', error.message);
    }
  }

  async function bulkDeleteSelectedItems() {
    cleanupFloatingLayers();
    const itemPaths = Array.from(selectedItems);
    if (itemPaths.length === 0) {
      await showMessage('Delete Selected', 'Please select at least one file or folder.');
      return;
    }

    const confirmed = await askForConfirm('Delete Selected', `Are you sure you want to delete ${itemPaths.length} selected item(s)?`);
    if (!confirmed) return;

    try {
      const result = await apiJson('/api/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, itemPaths })
      });
      resetSelectMode();
      await loadCurrentFolder();

requestAnimationFrame(() => {
  showMessage(
    'Delete Selected',
    `${result.successCount} item(s) moved to Restore Deleted.${result.failCount ? ` ${result.failCount} item(s) failed.` : ''}`
  );
});
    } catch (error) {
      await showMessage('Delete Selected', error.message);
    }
  }

  async function deleteItem(itemPath, isFolder) {
    cleanupFloatingLayers();
    const itemType = isFolder ? 'folder' : 'file';
    const confirmed = await askForConfirm('Delete', `Are you sure you want to delete this ${itemType}: ${basename(itemPath)}?`);
    if (!confirmed) return;

    try {
      await apiJson('/api/delete', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, itemPath })
      });
      await loadCurrentFolder();

requestAnimationFrame(() => {
  showMessage(
    'Delete',
    `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} moved to Restore Deleted.`
  );
});
    } catch (error) {
      await showMessage('Delete', error.message);
    }
  }

  async function showTrashList() {
    cleanupFloatingLayers();
    if (!currentDepartmentRoot) {
      await showMessage('Restore Deleted Items', 'Please select a department first.');
      return;
    }

    let records = [];
    try {
      const result = await apiJson(`/api/trash?department=${encodeURIComponent(currentDepartmentRoot)}`);
      records = result.records || [];
    } catch (error) {
      await showMessage('Restore Deleted Items', error.message);
      return;
    }

    let trashSelectMode = false;
    const selectedTrashRecords = new Set();

    const overlay = document.createElement('div');
    overlay.className = 'restore-overlay';

    const box = document.createElement('div');
    box.className = 'restore-box';

    const title = document.createElement('h3');
    title.textContent = 'Restore Deleted Items';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.className = 'restore-close-btn';

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hideContextMenu();
    }

    overlay.addEventListener('click', function (event) { event.stopPropagation(); });
    box.addEventListener('click', function (event) { event.stopPropagation(); });
    closeBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    const header = document.createElement('div');
    header.className = 'restore-header';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const restoreToolbar = document.createElement('div');
    restoreToolbar.className = 'restore-toolbar';

    const trashSelectBtn = document.createElement('button');
    trashSelectBtn.type = 'button';
    trashSelectBtn.textContent = 'Select';

    const bulkRestoreBtn = document.createElement('button');
    bulkRestoreBtn.type = 'button';
    bulkRestoreBtn.textContent = 'Restore Selected';
    bulkRestoreBtn.style.display = 'none';

    const bulkDeleteForeverBtn = document.createElement('button');
    bulkDeleteForeverBtn.type = 'button';
    bulkDeleteForeverBtn.textContent = 'Delete Forever Selected';
    bulkDeleteForeverBtn.className = 'delete-forever-btn';
    bulkDeleteForeverBtn.style.display = 'none';

    function updateTrashBulkButtons() {
      bulkRestoreBtn.textContent = selectedTrashRecords.size > 0 ? `Restore Selected (${selectedTrashRecords.size})` : 'Restore Selected';
      bulkDeleteForeverBtn.textContent = selectedTrashRecords.size > 0 ? `Delete Forever Selected (${selectedTrashRecords.size})` : 'Delete Forever Selected';
      bulkRestoreBtn.disabled = selectedTrashRecords.size === 0;
      bulkDeleteForeverBtn.disabled = selectedTrashRecords.size === 0;
    }

    trashSelectBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      trashSelectMode = !trashSelectMode;
      selectedTrashRecords.clear();
      trashSelectBtn.textContent = trashSelectMode ? 'Cancel Select' : 'Select';
      bulkRestoreBtn.style.display = trashSelectMode ? 'inline-block' : 'none';
      bulkDeleteForeverBtn.style.display = trashSelectMode ? 'inline-block' : 'none';
      updateTrashBulkButtons();
      list.querySelectorAll('.restore-select-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
        checkbox.style.display = trashSelectMode ? 'block' : 'none';
      });
      list.querySelectorAll('.restore-row').forEach((row) => row.classList.toggle('select-mode', trashSelectMode));
    });

    bulkRestoreBtn.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopPropagation();
      const ids = Array.from(selectedTrashRecords);
      if (ids.length === 0) return;
      const confirmed = await askForConfirm('Restore', `Restore ${ids.length} selected item(s)?`);
      if (!confirmed) return;
      close();
      await bulkRestoreDeletedItems(ids);
    });

    bulkDeleteForeverBtn.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopPropagation();
      const ids = Array.from(selectedTrashRecords);
      if (ids.length === 0) return;
      const confirmed = await askForConfirm('Delete Forever', `Delete ${ids.length} selected item(s) forever?\n\nThis cannot be undone.`);
      if (!confirmed) return;
      close();
      await bulkDeleteForeverItems(ids);
    });

    restoreToolbar.appendChild(trashSelectBtn);
    restoreToolbar.appendChild(bulkRestoreBtn);
    restoreToolbar.appendChild(bulkDeleteForeverBtn);

    const list = document.createElement('div');
    list.className = 'restore-list';

    if (records.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No deleted files or folders to restore.';
      empty.className = 'restore-empty';
      list.appendChild(empty);
    } else {
      records.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'restore-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'restore-select-checkbox';
        checkbox.style.display = 'none';
        checkbox.addEventListener('click', function (event) { event.stopPropagation(); });
        checkbox.addEventListener('change', function () {
          if (checkbox.checked) selectedTrashRecords.add(record.id);
          else selectedTrashRecords.delete(record.id);
          updateTrashBulkButtons();
        });

        row.addEventListener('click', function (event) {
          if (!trashSelectMode || event.target === checkbox) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        });

        const info = document.createElement('div');
        info.className = 'restore-info';

        const name = document.createElement('div');
        name.className = 'restore-name';
        name.textContent = `${record.isFolder ? '📁' : getFileIcon(record.originalName)} ${record.originalName}`;

        const detail = document.createElement('div');
        detail.className = 'restore-detail';
        detail.textContent = `Deleted: ${record.deletedAt} | Original: ${record.originalRelativePath}`;

        info.appendChild(name);
        info.appendChild(detail);
        row.appendChild(checkbox);
        row.appendChild(info);
        list.appendChild(row);
      });
    }

    box.appendChild(header);
    if (records.length > 0) box.appendChild(restoreToolbar);
    box.appendChild(list);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    updateTrashBulkButtons();
  }

  async function bulkRestoreDeletedItems(recordIds) {
    try {
      const result = await apiJson('/api/restore', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, recordIds })
      });
     await loadCurrentFolder();

requestAnimationFrame(() => {
  showMessage(
    'Restore',
    `${result.successCount} item(s) restored.${result.failCount ? ` ${result.failCount} item(s) failed or were missing.` : ''}`
  );
});
    } catch (error) {
      await showMessage('Restore', error.message);
    }
  }

  async function bulkDeleteForeverItems(recordIds) {
    try {
      const result = await apiJson('/api/delete-forever', {
        method: 'POST',
        body: JSON.stringify({ department: currentDepartmentRoot, recordIds })
      });
      await loadCurrentFolder();

requestAnimationFrame(() => {
  showMessage(
    'Delete Forever',
    `${result.successCount} item(s) deleted forever.${result.failCount ? ` ${result.failCount} item(s) failed.` : ''}`
  );
});
    } catch (error) {
      await showMessage('Delete Forever', error.message);
    }
  }

  function askForName(title, defaultValue) {
    cleanupFloatingLayers();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'name-overlay app-modal-overlay';
      const box = document.createElement('div');
      box.className = 'app-modal-box';
      const label = document.createElement('div');
      label.textContent = title;
      label.className = 'app-modal-title';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue || '';
      input.className = 'app-modal-input';
      const actions = document.createElement('div');
      actions.className = 'app-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'OK';
      let closed = false;
      function close(value) {
        if (closed) return;
        closed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setTimeout(() => resolve(value), 0);
      }
      overlay.addEventListener('click', function (event) { event.stopPropagation(); });
      box.addEventListener('click', function (event) { event.stopPropagation(); });
      cancelBtn.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); close(null); });
      okBtn.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); close(input.value); });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); close(input.value); }
        if (event.key === 'Escape') { event.preventDefault(); close(null); }
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(label);
      box.appendChild(input);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }

  function askForConfirm(title, message) {
    cleanupFloatingLayers();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay app-modal-overlay';
      const box = document.createElement('div');
      box.className = 'app-modal-box';
      const label = document.createElement('div');
      label.textContent = title;
      label.className = 'app-modal-title';
      const text = document.createElement('div');
      text.textContent = message;
      text.className = 'app-modal-message';
      const actions = document.createElement('div');
      actions.className = 'app-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'OK';
      let closed = false;
      function close(value) {
        if (closed) return;
        closed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setTimeout(() => resolve(value), 0);
      }
      overlay.addEventListener('click', function (event) { event.stopPropagation(); });
      box.addEventListener('click', function (event) { event.stopPropagation(); });
      cancelBtn.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); close(false); });
      okBtn.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); close(true); });
      overlay.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); close(false); } });
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(label);
      box.appendChild(text);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => okBtn.focus(), 30);
    });
  }

  function showMessage(title, message) {
    cleanupFloatingLayers();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'message-overlay app-modal-overlay';
      const box = document.createElement('div');
      box.className = 'app-modal-box';
      const label = document.createElement('div');
      label.textContent = title;
      label.className = 'app-modal-title';
      const text = document.createElement('div');
      text.textContent = message;
      text.className = 'app-modal-message';
      const actions = document.createElement('div');
      actions.className = 'app-modal-actions';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'OK';
      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setTimeout(resolve, 0);
      }
      overlay.addEventListener('click', function (event) { event.stopPropagation(); });
      box.addEventListener('click', function (event) { event.stopPropagation(); });
      okBtn.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); close(); });
      overlay.addEventListener('keydown', function (event) { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); close(); } });
      actions.appendChild(okBtn);
      box.appendChild(label);
      box.appendChild(text);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => okBtn.focus(), 30);
    });
  }

  function showContextMenu(x, y, items) {
    cleanupFloatingLayers();
    contextMenu.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        hideContextMenu();
        setTimeout(() => Promise.resolve().then(() => item.action()).catch((error) => {
          console.error('Context menu action failed:', error);
          showMessage('Action Failed', error.message || 'Action failed. Please try again.');
        }), 0);
      });
      contextMenu.appendChild(btn);
    });
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
  }

  function getBreadcrumbText() {
    if (!currentDepartmentRoot) return '';
    return currentFolder ? `${currentTitle} / ${currentFolder.split('/').join(' / ')}` : currentTitle;
  }

  function previewFile(itemPath, fileName) {

  const ext = getExt(fileName);

  const fileUrl =
    `/api/download?department=${encodeURIComponent(currentDepartmentRoot)}&path=${encodeURIComponent(itemPath)}`;

  // PDF DIRECT OPEN
  if (ext === '.pdf') {
    window.open(fileUrl, '_blank');
    return;
  }

  // IMAGE PREVIEW WINDOW
  const previewWindow = window.open('', '_blank');

  if (!previewWindow) {
    showMessage('Preview', 'Popup blocked.');
    return;
  }

  previewWindow.document.write(`
    <html>
    <head>
      <title>${fileName}</title>
      <style>
        body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #111;
          height: 100vh;
        }

        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
      </style>
    </head>
    <body>
      <img src="${fileUrl}" />
    </body>
    </html>
  `);

  previewWindow.document.close();
}

});
