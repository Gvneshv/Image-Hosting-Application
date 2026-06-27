/**
 * Admin panel logic.
 * Depends on lang.js for user-visible strings via window.t().
 */
(() => {
  const API_ME = `${location.origin}/auth/me`;
  const API_STATS = `${location.origin}/admin/stats`;
  const API_USERS = `${location.origin}/admin/users`;
  const userUrl = (id) => `${location.origin}/admin/users/${id}`;
  const userImagesUrl = (id) => `${location.origin}/admin/users/${id}/images`;
  const userBlockUrl = (id) => `${location.origin}/admin/users/${id}/block`;
  const userAdminUrl = (id) => `${location.origin}/admin/users/${id}/admin`;
  const userLockoutUrl = (id) => `${location.origin}/admin/users/${id}/lockout`;
  const imageDeleteUrl = (fn) =>
    `${location.origin}/admin/images/${encodeURIComponent(fn)}`;

  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
    return;
  }

  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      location.replace("index.html");
    }
    return response;
  };

  const $ = (s) => document.querySelector(s);

  // DOM references
  const navButtons = document.querySelectorAll(".sidebar-btn");
  const sections = document.querySelectorAll(".admin-section");
  const statTotalUsers = $("#stat-total-users");
  const statTotalImages = $("#stat-total-images");
  const statTotalSize = $("#stat-total-size");
  const statAdminUsers = $("#stat-admin-users");
  const statBlockedUsers = $("#stat-blocked-users");
  const userSearchInput = $("#user-search");
  const usersTableBody = $("#users-table-body");
  const usersPagination = $("#users-pagination");
  const openAddUserBtn = $("#open-add-user");
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
  const addUserOverlay = $("#add-user-overlay");
  const addUserForm = $("#add-user-form");
  const auEmail = $("#au-email");
  const auPassword = $("#au-password");
  const auIsAdmin = $("#au-is-admin");
  const auEmailError = $("#au-email-error");
  const auPasswordError = $("#au-password-error");
  const addUserCancel = $("#add-user-cancel");
  const addUserSubmit = $("#add-user-submit");
  const confirmOverlay = $("#confirm-action-overlay");
  const confirmTitle = $("#ca-title");
  const confirmBody = $("#ca-body");
  const confirmBtn = $("#ca-confirm");
  const confirmCancel = $("#ca-cancel");
  const infoOverlay = $("#info-overlay");
  const infoTitle = $("#info-title");
  const infoBody = $("#info-body");
  const infoOk = $("#info-ok");

  /* ---- Modal helpers ---- */
  const showModal = (overlay) => overlay.removeAttribute("hidden");
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /**
   * Show the generic info modal with a title and message.
   * @param {string} message
   * @param {string} [title]
   */
  const showInfo = (message, title = window.t("admin.js.notice.title")) => {
    infoTitle.textContent = title;
    infoBody.textContent = message;
    showModal(infoOverlay);
  };

  infoOk.addEventListener("click", () => hideModal(infoOverlay));
  infoOverlay.addEventListener("click", (e) => {
    if (e.target === infoOverlay) hideModal(infoOverlay);
  });

  /**
   * Show the generic confirm modal and resolve with the user's boolean choice.
   * @param {string} message
   * @param {string} [title]
   * @returns {Promise<boolean>}
   */
  const showConfirm = (message, title = window.t("admin.confirm.title")) => {
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

  /* ---- Admin guard ---- */
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

  /* ---- Sidebar navigation ---- */
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

  /* ---- Formatting helpers ---- */

  /** Format ISO date string as short local date, or "-" if null. */
  const formatDate = (iso) => {
    if (!iso) return window.t("admin.js.never");
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  };

  /** Format byte count as human-readable MB/GB string. */
  const formatBytes = (bytes) => {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  /* ---- Statistics ---- */
  const loadStats = async () => {
    try {
      const res = await authFetch(API_STATS);
      if (!res.ok) {
        showInfo(
          window.t("admin.js.error.network"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      const stats = await res.json();
      statTotalUsers.textContent = stats.total_users;
      statTotalImages.textContent = stats.total_images;
      statTotalSize.textContent = formatBytes(stats.total_size_bytes);
      statAdminUsers.textContent = stats.admin_users;
      statBlockedUsers.textContent = stats.blocked_users;
    } catch {
      showInfo(
        window.t("admin.js.error.network"),
        window.t("admin.js.error.title"),
      );
    }
  };

  /* ---- Users table ---- */
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
    prevBtn.textContent = `\u2039 ${window.t("controls.prev")}`;
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener("click", () => onPageChange(currentPage - 1));
    container.appendChild(prevBtn);

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = window.t("upload.page_info", {
      current: currentPage,
      total: totalPages,
    });
    container.appendChild(info);

    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = `${window.t("controls.next")} \u203a`;
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
        usersTableBody.innerHTML = `<tr><td colspan="7">${window.t("admin.js.error.network")}</td></tr>`;
        return;
      }
      const data = await res.json();
      renderUsersTable(data.users);
      renderPagination(usersPagination, data.page, data.pages, loadUsers);
    } catch {
      usersTableBody.innerHTML = `<tr><td colspan="7">${window.t("admin.js.error.network")}</td></tr>`;
    }
  };

  /** Escape HTML special chars to prevent injection via email strings. */
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

  /**
   * Render the users table body from a list of user objects.
   * @param {Array<object>} users
   */
  const renderUsersTable = (users) => {
    usersTableBody.innerHTML = "";
    if (!users.length) {
      usersTableBody.innerHTML = `<tr><td colspan="7">${window.t("admin.js.no_users")}</td></tr>`;
      return;
    }

    users.forEach((user) => {
      const tr = document.createElement("tr");
      tr.dataset.userId = user.id;

      const roleBadge = user.is_admin
        ? `<span class="badge badge--admin">${window.t("admin.js.badge.admin")}</span>`
        : `<span class="badge badge--user">${window.t("admin.js.badge.user")}</span>`;

      const statusBadge = user.is_blocked
        ? `<span class="badge badge--blocked">${window.t("admin.js.badge.blocked")}</span>`
        : `<span class="badge badge--active">${window.t("admin.js.badge.active")}</span>`;

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

  userSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadUsers(1), 300);
  });

  /* ---- User detail modal ---- */
  let currentDetailUser = null;
  let currentImagesPage = 1;
  const IMAGES_PER_PAGE = 10;

  /**
   * Open the user detail modal and load user info + their images.
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
        showInfo(
          window.t("admin.js.error.network"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      const user = await res.json();
      currentDetailUser = user;
      renderUserDetail(user);
      currentImagesPage = 1;
      await loadUserImages(userId, 1);
    } catch {
      hideModal(userDetailOverlay);
      showInfo(
        window.t("admin.js.error.network"),
        window.t("admin.js.error.title"),
      );
    }
  };

  /**
   * Populate the user detail panel from a user object.
   * @param {object} user
   */
  const renderUserDetail = (user) => {
    udEmail.textContent = user.email;
    udRole.innerHTML = user.is_admin
      ? `<span class="badge badge--admin">${window.t("admin.js.badge.admin")}</span>`
      : `<span class="badge badge--user">${window.t("admin.js.badge.user")}</span>`;
    udStatus.innerHTML = user.is_blocked
      ? `<span class="badge badge--blocked">${window.t("admin.js.badge.blocked")}</span>`
      : `<span class="badge badge--active">${window.t("admin.js.badge.active")}</span>`;
    udCreated.textContent = formatDate(user.created_at);
    udLastLogin.textContent = formatDate(user.last_login);
    udIp.textContent = user.registered_ip || "-";
    udImageCount.textContent = user.image_count;

    udToggleAdmin.textContent = user.is_admin
      ? window.t("admin.js.btn.revoke_admin")
      : window.t("admin.js.btn.grant_admin");
    udToggleBlock.textContent = user.is_blocked
      ? window.t("admin.js.btn.unblock")
      : window.t("admin.js.btn.block");
  };

  userDetailClose.addEventListener("click", () => hideModal(userDetailOverlay));
  userDetailOverlay.addEventListener("click", (e) => {
    if (e.target === userDetailOverlay) hideModal(userDetailOverlay);
  });

  /* ---- Per-user image browser ---- */

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
        userImagesGrid.innerHTML = `<p class="user-images-empty">${window.t("admin.js.error.network")}</p>`;
        return;
      }
      const data = await res.json();
      renderUserImages(data.images);
      renderPagination(userImagesPagination, data.page, data.pages, (p) =>
        loadUserImages(userId, p),
      );
    } catch {
      userImagesGrid.innerHTML = `<p class="user-images-empty">${window.t("admin.js.error.network")}</p>`;
    }
  };

  /**
   * Render the image grid inside the user detail modal.
   * @param {Array<object>} images
   */
  const renderUserImages = (images) => {
    userImagesGrid.innerHTML = "";
    if (!images.length) {
      userImagesGrid.innerHTML = `<p class="user-images-empty">${window.t("admin.js.no_images")}</p>`;
      return;
    }

    images.forEach((img) => {
      const card = document.createElement("div");
      card.className = "user-image-card";
      card.innerHTML = `
        <img src="/images/${encodeURIComponent(img.unique_name)}" alt="${escapeHtml(img.original_name)}" loading="lazy" />
        <button class="user-image-delete" title="Delete image">&times;</button>
      `;

      card
        .querySelector(".user-image-delete")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await showConfirm(
            `Delete image "${img.original_name}"? This cannot be undone.`,
            window.t("viewer.delete.title"),
          );
          if (!ok) return;

          try {
            const res = await authFetch(imageDeleteUrl(img.unique_name), {
              method: "DELETE",
            });
            if (!res.ok) {
              showInfo(
                window.t("admin.js.error.delete_image"),
                window.t("admin.js.error.title"),
              );
              return;
            }
            if (currentDetailUser) {
              currentDetailUser.image_count -= 1;
              udImageCount.textContent = currentDetailUser.image_count;
            }
            await loadUserImages(currentDetailUser.id, currentImagesPage);
          } catch {
            showInfo(
              window.t("admin.js.error.delete_image"),
              window.t("admin.js.error.title"),
            );
          }
        });

      userImagesGrid.appendChild(card);
    });
  };

  /* ---- User detail action buttons ---- */

  udToggleAdmin.addEventListener("click", async () => {
    if (!currentDetailUser) return;
    const newValue = !currentDetailUser.is_admin;

    if (!newValue) {
      const ok = await showConfirm(
        window.t("admin.js.confirm.revoke_admin", {
          email: currentDetailUser.email,
        }),
        window.t("admin.js.confirm.revoke_admin.title"),
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
        showInfo(
          data.detail || window.t("admin.js.error.admin_status"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      currentDetailUser = { ...currentDetailUser, ...data };
      renderUserDetail(currentDetailUser);
      loadUsers(usersPage);
    } catch {
      showInfo(
        window.t("admin.js.error.admin_status"),
        window.t("admin.js.error.title"),
      );
    }
  });

  udToggleBlock.addEventListener("click", async () => {
    if (!currentDetailUser) return;
    const newValue = !currentDetailUser.is_blocked;

    const ok = await showConfirm(
      newValue
        ? window.t("admin.js.confirm.block", { email: currentDetailUser.email })
        : window.t("admin.js.confirm.unblock", {
            email: currentDetailUser.email,
          }),
      newValue
        ? window.t("admin.js.confirm.block.title")
        : window.t("admin.js.confirm.unblock.title"),
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
        showInfo(
          data.detail || window.t("admin.js.error.block_status"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      currentDetailUser = { ...currentDetailUser, ...data };
      renderUserDetail(currentDetailUser);
      loadUsers(usersPage);
    } catch {
      showInfo(
        window.t("admin.js.error.block_status"),
        window.t("admin.js.error.title"),
      );
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
        showInfo(
          data.detail || window.t("admin.js.error.clear_lockout"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      showInfo(data.message, window.t("admin.js.lockout_cleared.title"));
    } catch {
      showInfo(
        window.t("admin.js.error.clear_lockout"),
        window.t("admin.js.error.title"),
      );
    }
  });

  udDeleteUser.addEventListener("click", async () => {
    if (!currentDetailUser) return;
    const ok = await showConfirm(
      window.t("admin.js.confirm.delete_user", {
        email: currentDetailUser.email,
        count: currentDetailUser.image_count,
      }),
      window.t("admin.js.confirm.delete_user.title"),
    );
    if (!ok) return;

    try {
      const res = await authFetch(userUrl(currentDetailUser.id), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showInfo(
          data.detail || window.t("admin.js.error.delete_user"),
          window.t("admin.js.error.title"),
        );
        return;
      }
      hideModal(userDetailOverlay);
      showInfo(data.message, window.t("admin.js.confirm.delete_user.title"));
      loadUsers(usersPage);
      loadStats();
    } catch {
      showInfo(
        window.t("admin.js.error.delete_user"),
        window.t("admin.js.error.title"),
      );
    }
  });

  /* ---- Add user modal ---- */
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
      auEmailError.textContent = window.t("admin.js.error.email_req");
      auEmail.classList.add("input-error");
      valid = false;
    }
    if (auPassword.value.length < 8) {
      auPasswordError.textContent = window.t("admin.js.error.pass_min");
      auPassword.classList.add("input-error");
      valid = false;
    }
    if (!valid) return;

    addUserSubmit.disabled = true;
    addUserSubmit.textContent = window.t("admin.js.add_user.submitting");

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
          data.detail || window.t("admin.js.error.email_taken");
        auEmail.classList.add("input-error");
        return;
      }
      if (!res.ok) {
        showInfo(
          data.detail || window.t("admin.js.error.create_user"),
          window.t("admin.js.error.title"),
        );
        return;
      }

      hideModal(addUserOverlay);
      showInfo(
        window.t("admin.js.user_created", { email: data.email }),
        window.t("admin.js.user_created.title"),
      );
      loadUsers(1);
      loadStats();
    } catch {
      showInfo(
        window.t("admin.js.error.network"),
        window.t("admin.js.error.title"),
      );
    } finally {
      addUserSubmit.disabled = false;
      addUserSubmit.textContent = window.t("admin.js.add_user.submit");
    }
  });

  // Re-sync submit button label on language change while idle
  window.addEventListener("langchange", () => {
    if (!addUserSubmit.disabled)
      addUserSubmit.textContent = window.t("admin.js.add_user.submit");
  });

  /* ---- ESC key ---- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!userDetailOverlay.hidden) hideModal(userDetailOverlay);
    if (!addUserOverlay.hidden) hideModal(addUserOverlay);
    if (!infoOverlay.hidden) hideModal(infoOverlay);
    // confirmOverlay excluded - destructive actions require explicit choice.
  });

  /* ---- Init ---- */
  (async () => {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) return;
    loadStats();
  })();
})();
