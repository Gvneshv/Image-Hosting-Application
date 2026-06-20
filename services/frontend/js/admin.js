/**
 * Admin panel logic.
 *
 * Responsibilities:
 *  1. Auth guard - redirect unauthenticated visitors to index.html.
 *  2. Admin guard - if GET /auth/me returns is_admin=false, redirect to upload.html (non-admins should never see this page).
 *  3. Sidebar navigation - toggle between Statistics and Users sections.
 *  4. Statistics - load and display GET /admin/stats.
 *  5. Users table - paginated, searchable list via GET /admin/users.
 *  6. User detail modal - GET /admin/users/{id} + per-user image browser via GET /admin/users/{id}/images.
 *  7. Actions: add user, block/unblock, grant/revoke admin, clear lockout, delete user, delete individual images.
 *  8. Generic confirm/info modals reused across all destructive actions.
 */

(() => {
  /* -------------------------------------------------------------------------
   *  API endpoints
   * ---------------------------------------------------------------------- */
  const API_ME = `${location.origin}/auth/me`;
  const API_STATS = `${location.origin}/admin/stats`;
  const API_USERS = `${location.origin}/admin/users`;
  const userUrl = (id) => `${location.origin}/admin/users/${id}`;
  const userImagesUrl = (id) => `${location.origin}/admin/users/${id}/images`;
  const userBlockUrl = (id) => `${location.origin}/admin/users/${id}/block`;
  const userAdminUrl = (id) => `${location.origin}/admin/users/${id}/admin`;
  const userLockoutUrl = (id) => `${location.origin}/admin/users/${id}/lockout`;
  const imageDeleteUrl = (filename) =>
    `${location.origin}/admin/images/${encodeURIComponent(filename)}`;

  /* -------------------------------------------------------------------------
   *  Auth guard
   * ---------------------------------------------------------------------- */
  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
    return;
  }

  /**
   * Fetch wrapper that attaches the Bearer token and handles 401 globally.
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<Response>}
   */
  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("access_token");
      location.replace("index.html");
    }

    return response;
  };

  /* -------------------------------------------------------------------------
   *  DOM references
   * ---------------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);

  const navButtons = document.querySelectorAll(".sidebar-btn");
  const sections = document.querySelectorAll(".admin-section");

  // Stats
  const statTotalUsers = $("#stat-total-users");
  const statTotalImages = $("#stat-total-images");
  const statTotalSize = $("#stat-total-size");
  const statAdminUsers = $("#stat-admin-users");
  const statBlockedUsers = $("#stat-blocked-users");

  // Users table
  const userSearchInput = $("#user-search");
  const usersTableBody = $("#users-table-body");
  const usersPagination = $("#users-pagination");
  const openAddUserBtn = $("#open-add-user");

  // User detail modal
  const userDetailOverlay = $("#user-detail-overlay");
  const userDetailClose = $("#user-detail-close");
  const udEmail = $("#ud-email");
  const udRole = $("#ud-role");
  const udStatus = $("#ud-status");
  const udCreated = $("#ud-created");
  const udLastLogin = $("#ud-last-login");
  const udIp = $("#ud-ip");
  const udImageCount = $("#ud-image-count");
  const udToggleAdmin = $("#ud-toggle-admin");
  const udToggleBlock = $("#ud-toggle-block");
  const udClearLockout = $("#ud-clear-lockout");
  const udDeleteUser = $("#ud-delete-user");
  const userImagesGrid = $("#user-images-grid");
  const userImagesPagination = $("#user-images-pagination");

  // Add user modal
  const addUserOverlay = $("#add-user-overlay");
  const addUserForm = $("#add-user-form");
  const auEmail = $("#au-email");
  const auPassword = $("#au-password");
  const auIsAdmin = $("#au-is-admin");
  const auEmailError = $("#au-email-error");
  const auPasswordError = $("#au-password-error");
  const addUserCancel = $("#add-user-cancel");
  const addUserSubmit = $("#add-user-submit");

  // Generic confirm modal
  const confirmOverlay = $("#confirm-action-overlay");
  const confirmTitle = $("#ca-title");
  const confirmBody = $("#ca-body");
  const confirmBtn = $("#ca-confirm");
  const confirmCancel = $("#ca-cancel");

  // Generic info modal
  const infoOverlay = $("#info-overlay");
  const infoTitle = $("#info-title");
  const infoBody = $("#info-body");
  const infoOk = $("#info-ok");

  /* -------------------------------------------------------------------------
   *  Modal helpers - `hidden` attribute pattern (matches account.js)
   * ---------------------------------------------------------------------- */
  const showModal = (overlay) => overlay.removeAttribute("hidden");
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /**
   * Show the generic info modal.
   * @param {string} message
   * @param {string} [title]
   */
  const showInfo = (message, title = "Notice") => {
    infoTitle.textContent = title;
    infoBody.textContent = message;
    showModal(infoOverlay);
  };

  infoOk.addEventListener("click", () => hideModal(infoOverlay));
  infoOverlay.addEventListener("click", (e) => {
    if (e.target === infoOverlay) hideModal(infoOverlay);
  });

  /**
   * Show the generic confirm modal and resolve with the user's choice.
   * @param {string} message
   * @param {string} [title]
   * @returns {Promise<boolean>}
   */
  const showConfirm = (message, title = "Confirm Action") => {
    confirmTitle.textContent = title;
    confirmBody.textContent = message;
    showModal(confirmOverlay);

    return new Promise((resolve) => {
      const cleanup = () => {
        confirmBtn.removeEventListener("click", onConfirm);
        confirmCancel.removeEventListener("click", onCancel);
        confirmOverlay.removeEventListener("click", onOutside);
      };
      const onConfirm = () => {
        hideModal(confirmOverlay);
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        hideModal(confirmOverlay);
        cleanup();
        resolve(false);
      };
      const onOutside = (e) => {
        if (e.target === confirmOverlay) onCancel();
      };

      confirmBtn.addEventListener("click", onConfirm);
      confirmCancel.addEventListener("click", onCancel);
      confirmOverlay.addEventListener("click", onOutside);
    });
  };

  /* -------------------------------------------------------------------------
   *  Admin guard - verify is_admin before showing anything
   * ---------------------------------------------------------------------- */
  const verifyAdmin = async () => {
    try {
      const res = await authFetch(API_ME);
      if (!res.ok) {
        location.replace("index.html");
        return false;
      }
      const me = await res.json();
      if (!me.is_admin) {
        location.replace("upload.html");
        return false;
      }
      return true;
    } catch {
      location.replace("index.html");
      return false;
    }
  };

  /* -------------------------------------------------------------------------
   *  Sidebar navigation
   * ---------------------------------------------------------------------- */
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;

      navButtons.forEach((b) => b.classList.remove("sidebar-btn--active"));
      btn.classList.add("sidebar-btn--active");

      sections.forEach((s) => s.classList.add("admin-section--hidden"));
      document
        .getElementById(targetId)
        ?.classList.remove("admin-section--hidden");

      if (targetId === "section-stats") loadStats();
      if (targetId === "section-users") loadUsers();
    });
  });

  /* -------------------------------------------------------------------------
   *  Formatting helpers
   * ---------------------------------------------------------------------- */

  /** Format an ISO date string as a short local date, or "-" if null. */
  const formatDate = (iso) => {
    if (!iso) return "-";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  };

  /** Format a byte count as a human-readable MB/GB string. */
  const formatBytes = (bytes) => {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  /* -------------------------------------------------------------------------
   *  Statistics
   * ---------------------------------------------------------------------- */
  const loadStats = async () => {
    try {
      const res = await authFetch(API_STATS);
      if (!res.ok) {
        showInfo("Failed to load statistics.", "Error");
        return;
      }
      const stats = await res.json();

      statTotalUsers.textContent = stats.total_users;
      statTotalImages.textContent = stats.total_images;
      statTotalSize.textContent = formatBytes(stats.total_size_bytes);
      statAdminUsers.textContent = stats.admin_users;
      statBlockedUsers.textContent = stats.blocked_users;
    } catch {
      showInfo("Network error while loading statistics.", "Error");
    }
  };

  /* -------------------------------------------------------------------------
   *  Users table
   * ---------------------------------------------------------------------- */
  let usersPage = 1;
  const USERS_PER_PAGE = 10;
  let searchDebounceTimer = null;

  /**
   * Render a generic pagination control into the given container.
   * @param {HTMLElement} container
   * @param {number} currentPage
   * @param {number} totalPages
   * @param {(page: number) => void} onPageChange
   */
  const renderPagination = (
    container,
    currentPage,
    totalPages,
    onPageChange,
  ) => {
    container.innerHTML = "";
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.textContent = "‹ Prev";
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener("click", () => onPageChange(currentPage - 1));
    container.appendChild(prevBtn);

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = `Page ${currentPage} of ${totalPages}`;
    container.appendChild(info);

    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = "Next ›";
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener("click", () => onPageChange(currentPage + 1));
    container.appendChild(nextBtn);
  };

  /**
   * Load and render the users table for the given page and search term.
   * @param {number} [page]
   */
  const loadUsers = async (page = usersPage) => {
    usersPage = page;
    const search = userSearchInput.value.trim();

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(USERS_PER_PAGE),
    });
    if (search) params.set("search", search);

    try {
      const res = await authFetch(`${API_USERS}?${params.toString()}`);
      if (!res.ok) {
        usersTableBody.innerHTML = `<tr><td colspan="7">Failed to load users.</td></tr>`;
        return;
      }
      const data = await res.json();
      renderUsersTable(data.users);
      renderPagination(usersPagination, data.page, data.pages, loadUsers);
    } catch {
      usersTableBody.innerHTML = `<tr><td colspan="7">Network error while loading users.</td></tr>`;
    }
  };

  /**
   * Render the users table body from a list of user dicts.
   * @param {Array<object>} users
   */
  const renderUsersTable = (users) => {
    usersTableBody.innerHTML = "";

    if (!users.length) {
      usersTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    users.forEach((user) => {
      const tr = document.createElement("tr");
      tr.dataset.userId = user.id;

      const roleBadge = user.is_admin
        ? `<span class="badge badge--admin">Admin</span>`
        : `<span class="badge badge--user">User</span>`;

      const statusBadge = user.is_blocked
        ? `<span class="badge badge--blocked">Blocked</span>`
        : `<span class="badge badge--active">Active</span>`;

      tr.innerHTML = `
        <td class="email-cell">${escapeHtml(user.email)}</td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>${user.image_count}</td>
        <td>${formatDate(user.last_login)}</td>
        <td>${formatDate(user.created_at)}</td>
        <td class="users-table-actions">
          <button class="table-action-btn" title="View details" data-action="view">👁️</button>
        </td>
      `;

      tr.addEventListener("click", () => openUserDetail(user.id));
      usersTableBody.appendChild(tr);
    });
  };

  /** Escape HTML special characters to prevent injection via email strings. */
  const escapeHtml = (str) =>
    str.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // Debounced search
  userSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadUsers(1), 300);
  });

  /* -------------------------------------------------------------------------
   *  User detail modal
   * ---------------------------------------------------------------------- */
  let currentDetailUser = null; // cached user dict for the open modal
  let currentImagesPage = 1;
  const IMAGES_PER_PAGE = 12;

  /**
   * Open the user detail modal and load both the user info and their images.
   * @param {number} userId
   */
  const openUserDetail = async (userId) => {
    showModal(userDetailOverlay);
    udEmail.textContent = "Loading...";
    [udRole, udStatus, udCreated, udLastLogin, udIp, udImageCount].forEach(
      (el) => (el.textContent = "-"),
    );
    userImagesGrid.innerHTML = "";
    userImagesPagination.innerHTML = "";

    try {
      const res = await authFetch(userUrl(userId));
      if (!res.ok) {
        hideModal(userDetailOverlay);
        showInfo("Failed to load user details.", "Error");
        return;
      }
      const user = await res.json();
      currentDetailUser = user;
      renderUserDetail(user);

      currentImagesPage = 1;
      await loadUserImages(userId, 1);
    } catch {
      hideModal(userDetailOverlay);
      showInfo("Network error while loading user details.", "Error");
    }
  };

  /**
   * Populate the user detail panel from a user dict.
   * @param {object} user
   */
  const renderUserDetail = (user) => {
    udEmail.textContent = user.email;
    udRole.innerHTML = user.is_admin
      ? `<span class="badge badge--admin">Admin</span>`
      : `<span class="badge badge--user">User</span>`;
    udStatus.innerHTML = user.is_blocked
      ? `<span class="badge badge--blocked">Blocked</span>`
      : `<span class="badge badge--active">Active</span>`;
    udCreated.textContent = formatDate(user.created_at);
    udLastLogin.textContent = formatDate(user.last_login);
    udIp.textContent = user.registered_ip || "-";
    udImageCount.textContent = user.image_count;

    udToggleAdmin.textContent = user.is_admin ? "Revoke Admin" : "Grant Admin";
    udToggleBlock.textContent = user.is_blocked ? "Unblock User" : "Block User";
  };

  userDetailClose.addEventListener("click", () => hideModal(userDetailOverlay));
  userDetailOverlay.addEventListener("click", (e) => {
    if (e.target === userDetailOverlay) hideModal(userDetailOverlay);
  });

  /* --- Per-user image browser --- */

  /**
   * Load and render a page of images for the given user.
   * @param {number} userId
   * @param {number} page
   */
  const loadUserImages = async (userId, page) => {
    currentImagesPage = page;
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(IMAGES_PER_PAGE),
    });

    try {
      const res = await authFetch(
        `${userImagesUrl(userId)}?${params.toString()}`,
      );
      if (!res.ok) {
        userImagesGrid.innerHTML = `<p class="user-images-empty">Failed to load images.</p>`;
        return;
      }
      const data = await res.json();
      renderUserImages(data.images);
      renderPagination(userImagesPagination, data.page, data.pages, (p) =>
        loadUserImages(userId, p),
      );
    } catch {
      userImagesGrid.innerHTML = `<p class="user-images-empty">Network error while loading images.</p>`;
    }
  };

  /**
   * Render the image grid for the user detail modal.
   * @param {Array<object>} images
   */
  const renderUserImages = (images) => {
    userImagesGrid.innerHTML = "";

    if (!images.length) {
      userImagesGrid.innerHTML = `<p class="user-images-empty">No images.</p>`;
      return;
    }

    images.forEach((img) => {
      const card = document.createElement("div");
      card.className = "user-image-card";
      card.innerHTML = `
        <img src="/images/${encodeURIComponent(img.unique_name)}" alt="${escapeHtml(img.original_name)}" loading="lazy" />
        <button class="user-image-delete" title="Delete image">×</button>
      `;

      card
        .querySelector(".user-image-delete")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await showConfirm(
            `Delete image "${img.original_name}"? This cannot be undone.`,
            "Delete Image",
          );
          if (!ok) return;

          try {
            const res = await authFetch(imageDeleteUrl(img.unique_name), {
              method: "DELETE",
            });
            if (!res.ok) {
              showInfo("Failed to delete image.", "Error");
              return;
            }
            // Refresh both the image grid and the user's image count.
            if (currentDetailUser) {
              currentDetailUser.image_count -= 1;
              udImageCount.textContent = currentDetailUser.image_count;
            }
            await loadUserImages(currentDetailUser.id, currentImagesPage);
          } catch {
            showInfo("Network error while deleting image.", "Error");
          }
        });

      userImagesGrid.appendChild(card);
    });
  };

  /* --- User detail actions --- */

  udToggleAdmin.addEventListener("click", async () => {
    if (!currentDetailUser) return;
    const newValue = !currentDetailUser.is_admin;

    if (!newValue) {
      const ok = await showConfirm(
        `Revoke admin privileges from "${currentDetailUser.email}"?`,
        "Revoke Admin",
      );
      if (!ok) return;
    }

    try {
      const res = await authFetch(userAdminUrl(currentDetailUser.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: newValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        showInfo(data.detail || "Failed to update admin status.", "Error");
        return;
      }
      currentDetailUser = { ...currentDetailUser, ...data };
      renderUserDetail(currentDetailUser);
      loadUsers(usersPage);
    } catch {
      showInfo("Network error while updating admin status.", "Error");
    }
  });

  udToggleBlock.addEventListener("click", async () => {
    if (!currentDetailUser) return;
    const newValue = !currentDetailUser.is_blocked;

    const ok = await showConfirm(
      newValue
        ? `Block "${currentDetailUser.email}"? They will be unable to log in.`
        : `Unblock "${currentDetailUser.email}"?`,
      newValue ? "Block User" : "Unblock User",
    );
    if (!ok) return;

    try {
      const res = await authFetch(userBlockUrl(currentDetailUser.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: newValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        showInfo(data.detail || "Failed to update block status.", "Error");
        return;
      }
      currentDetailUser = { ...currentDetailUser, ...data };
      renderUserDetail(currentDetailUser);
      loadUsers(usersPage);
    } catch {
      showInfo("Network error while updating block status.", "Error");
    }
  });

  udClearLockout.addEventListener("click", async () => {
    if (!currentDetailUser) return;

    try {
      const res = await authFetch(userLockoutUrl(currentDetailUser.id), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showInfo(data.detail || "Failed to clear lockout.", "Error");
        return;
      }
      showInfo(data.message, "Lockout Cleared");
    } catch {
      showInfo("Network error while clearing lockout.", "Error");
    }
  });

  udDeleteUser.addEventListener("click", async () => {
    if (!currentDetailUser) return;

    const ok = await showConfirm(
      `Permanently delete "${currentDetailUser.email}" and all ${currentDetailUser.image_count} of their images? This cannot be undone.`,
      "Delete User",
    );
    if (!ok) return;

    try {
      const res = await authFetch(userUrl(currentDetailUser.id), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showInfo(data.detail || "Failed to delete user.", "Error");
        return;
      }
      hideModal(userDetailOverlay);
      showInfo(data.message, "User Deleted");
      loadUsers(usersPage);
      loadStats();
    } catch {
      showInfo("Network error while deleting user.", "Error");
    }
  });

  /* -------------------------------------------------------------------------
   *  Add user modal
   * ---------------------------------------------------------------------- */
  openAddUserBtn.addEventListener("click", () => {
    addUserForm.reset();
    [auEmail, auPassword].forEach((el) => el.classList.remove("input-error"));
    auEmailError.textContent = "";
    auPasswordError.textContent = "";
    showModal(addUserOverlay);
  });

  addUserCancel.addEventListener("click", () => hideModal(addUserOverlay));
  addUserOverlay.addEventListener("click", (e) => {
    if (e.target === addUserOverlay) hideModal(addUserOverlay);
  });

  addUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    let valid = true;
    auEmail.classList.remove("input-error");
    auPassword.classList.remove("input-error");
    auEmailError.textContent = "";
    auPasswordError.textContent = "";

    if (!auEmail.value.trim()) {
      auEmailError.textContent = "Email is required.";
      auEmail.classList.add("input-error");
      valid = false;
    }
    if (auPassword.value.length < 8) {
      auPasswordError.textContent = "Password must be at least 8 characters.";
      auPassword.classList.add("input-error");
      valid = false;
    }
    if (!valid) return;

    addUserSubmit.disabled = true;
    addUserSubmit.textContent = "Creating...";

    try {
      const res = await authFetch(API_USERS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: auEmail.value.trim(),
          password: auPassword.value,
          is_admin: auIsAdmin.checked,
        }),
      });
      const data = await res.json();

      if (res.status === 400) {
        auEmailError.textContent =
          data.detail || "This email is already in use.";
        auEmail.classList.add("input-error");
        return;
      }
      if (!res.ok) {
        showInfo(data.detail || "Failed to create user.", "Error");
        return;
      }

      hideModal(addUserOverlay);
      showInfo(`User "${data.email}" created successfully.`, "User Created");
      loadUsers(1);
      loadStats();
    } catch {
      showInfo("Network error while creating user.", "Error");
    } finally {
      addUserSubmit.disabled = false;
      addUserSubmit.textContent = "Create User";
    }
  });

  /* -------------------------------------------------------------------------
   *  ESC key - closes any open modal except destructive confirmations
   * ---------------------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!userDetailOverlay.hidden) hideModal(userDetailOverlay);
    if (!addUserOverlay.hidden) hideModal(addUserOverlay);
    if (!infoOverlay.hidden) hideModal(infoOverlay);
    // confirmOverlay intentionally excluded - destructive actions need an explicit choice.
  });

  /* -------------------------------------------------------------------------
   *  Init
   * ---------------------------------------------------------------------- */
  (async () => {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return;
    loadStats();
  })();
})();
