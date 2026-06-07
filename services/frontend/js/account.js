/**
 * Account page logic
 *
 * Responsibilities:
 *  1. Auth guard - redirect unauthenticated visitors to index.html.
 *  2. Decode the JWT to extract the user's email; call GET /auth/me for server-authoritative data (email, created_at).
 *  3. Populate the My Info section.
 *  4. Sidebar navigation - toggle between "My Info" and "Change Password".
 *  5. Change password form - POST /auth/change-password.
 *  6. Logout - clear token, redirect to index.html.
 *  7. Delete account - DELETE /auth/account, clear token, redirect.
 *  8. Wire up all modals.
 */

(() => {
  /* -------------------------------------------------------------------------
   *  API endpoints
   * ---------------------------------------------------------------------- */
  const API_ME = `${location.origin}/auth/me`;
  const API_CHANGE_PASSWORD = `${location.origin}/auth/change-password`;
  const API_DELETE_ACCOUNT = `${location.origin}/auth/account`;

  /* -------------------------------------------------------------------------
   *  Auth guard - redirect if no token is stored.
   *  Uses replace() so the back button doesn't loop back here.
   * ---------------------------------------------------------------------- */
  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
  }

  /* -------------------------------------------------------------------------
   *  Shared fetch helper
   *
   *  Attaches `Authorization: Bearer <token>` to every request and handles
   *  token expiry (401) globally - expired tokens redirect to login rather than leaving the user staring at a broken page.
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<Response>}
   * ---------------------------------------------------------------------- */
  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    // If the server rejects the token (expired / invalid), log the user out immediately rather than showing a confusing error message.
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      location.replace("index.html");
    }

    return response;
  };

  /* -------------------------------------------------------------------------
   *  DOM references - My Info section
   * ---------------------------------------------------------------------- */
  const infoEmail = document.getElementById("info-email");
  const infoCreatedAt = document.getElementById("info-created-at");

  /* -------------------------------------------------------------------------
   *  DOM references - Change Password form
   * ---------------------------------------------------------------------- */
  const changePasswordForm = document.getElementById("change-password-form");
  const currentPasswordInput = document.getElementById("current-password");
  const newPasswordInput = document.getElementById("new-password");
  const confirmNewInput = document.getElementById("confirm-new-password");
  const currentPasswordError = document.getElementById("current-password-error");
  const newPasswordError = document.getElementById("new-password-error");
  const confirmNewError = document.getElementById("confirm-new-password-error");
  const changePasswordBtn = document.getElementById("change-password-btn");

  /* -------------------------------------------------------------------------
   *  DOM references - Sidebar
   * ---------------------------------------------------------------------- */
  const navButtons = document.querySelectorAll(".sidebar-btn");
  const sections = document.querySelectorAll(".account-section");
  const logoutBtn = document.getElementById("logout-btn");
  const deleteBtn = document.getElementById("delete-account-btn");

  /* -------------------------------------------------------------------------
   *  DOM references - Modals
   * ---------------------------------------------------------------------- */
  const logoutOverlay = document.getElementById("logout-overlay");
  const logoutCancel = document.getElementById("logout-cancel");
  const logoutConfirm = document.getElementById("logout-confirm");

  const deleteAccountOverlay = document.getElementById("delete-account-overlay");
  const deleteAccountCancel = document.getElementById("delete-account-cancel");
  const deleteAccountConfirm = document.getElementById("delete-account-confirm");

  const passwordSuccessOverlay = document.getElementById("password-success-overlay");
  const passwordSuccessOk = document.getElementById("password-success-ok");

  const wrongPasswordOverlay = document.getElementById("wrong-password-overlay");
  const wrongPasswordOk = document.getElementById("wrong-password-ok");

  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");

  /* -------------------------------------------------------------------------
   *  Modal helpers - `hidden` attribute pattern
   * ---------------------------------------------------------------------- */

  /** Show a modal overlay by removing its `hidden` attribute. */
  const showModal = (overlay) => overlay.removeAttribute("hidden");

  /** Hide a modal overlay by setting its `hidden` attribute. */
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /* -------------------------------------------------------------------------
   *  Load user info from the server
   *
   *  GET /auth/me returns { id, email, is_admin, created_at }.
   *  We use the server response rather than decoding the JWT client-side
   *  so the displayed data is always authoritative (e.g. after an email change in the future).
   * ---------------------------------------------------------------------- */
  const loadUserInfo = async () => {
    try {
      const response = await authFetch(API_ME);
      if (!response.ok) {
        // Non-401 error (401 is handled inside authFetch)
        infoEmail.textContent = "Could not load";
        infoCreatedAt.textContent = "Could not load";
        return;
      }

      const user = await response.json();

      infoEmail.textContent = user.email;

      // Format the ISO timestamp into a human-readable local date.
      // created_at comes from the DB as an ISO 8601 string (UTC).
      infoCreatedAt.textContent = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(user.created_at));
    } catch {
      // Network failure
      infoEmail.textContent = "Could not load";
      infoCreatedAt.textContent = "Could not load";
    }
  };

  loadUserInfo();

  /* -------------------------------------------------------------------------
   *  Sidebar navigation
   *
   *  Each sidebar button has a `data-target` attribute matching the `id`
   *  of the corresponding section.  Clicking a button:
   *    1. Removes `sidebar-btn--active` from all buttons, adds to clicked.
   *    2. Adds `account-section--hidden` to all sections, removes from target.
   * ---------------------------------------------------------------------- */
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;

      // Update active button state
      navButtons.forEach((b) => b.classList.remove("sidebar-btn--active"));
      btn.classList.add("sidebar-btn--active");

      // Show only the targeted section
      sections.forEach((s) => s.classList.add("account-section--hidden"));
      document.getElementById(targetId)?.classList.remove("account-section--hidden");

      // Clear password form state when leaving that section so stale errors don't show if the user navigates away and comes back.
      if (targetId !== "section-password") {
        resetPasswordForm();
      }
    });
  });

  /* -------------------------------------------------------------------------
   *  Change Password - validation
   * ---------------------------------------------------------------------- */

  /**
   * Validate the change-password form fields.
   * @returns {boolean} true if all fields pass.
   */
  const validatePasswordForm = () => {
    let valid = true;
    let firstInvalid = null;

    // Clear previous state
    [currentPasswordInput, newPasswordInput, confirmNewInput].forEach(
      (input) => {
        input.classList.remove("input-error");
      },
    );
    currentPasswordError.textContent = "";
    newPasswordError.textContent = "";
    confirmNewError.textContent = "";

    const current = currentPasswordInput.value;
    const next = newPasswordInput.value;
    const confirm = confirmNewInput.value;

    if (!current) {
      currentPasswordError.textContent = "Current password is required.";
      currentPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? currentPasswordInput;
      valid = false;
    }

    if (!next) {
      newPasswordError.textContent = "New password is required.";
      newPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? newPasswordInput;
      valid = false;
    } else if (next.length < 8) {
      newPasswordError.textContent =
        "New password must be at least 8 characters.";
      newPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? newPasswordInput;
      valid = false;
    } else if (next === current) {
      // Catch a common mistake before hitting the server.
      newPasswordError.textContent =
        "New password must differ from the current one.";
      newPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? newPasswordInput;
      valid = false;
    }

    if (!confirm) {
      confirmNewError.textContent = "Please confirm your new password.";
      confirmNewInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmNewInput;
      valid = false;
    } else if (confirm !== next) {
      confirmNewError.textContent = "Passwords do not match.";
      confirmNewInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmNewInput;
      valid = false;
    }

    firstInvalid?.focus();
    return valid;
  };

  /** Clear all change-password form state (values, errors, disabled state). */
  const resetPasswordForm = () => {
    changePasswordForm.reset();
    [currentPasswordInput, newPasswordInput, confirmNewInput].forEach(
      (input) => {
        input.classList.remove("input-error");
      },
    );
    currentPasswordError.textContent = "";
    newPasswordError.textContent = "";
    confirmNewError.textContent = "";
  };

  /* -------------------------------------------------------------------------
   *  Change Password - live confirm feedback (same pattern as register.js)
   * ---------------------------------------------------------------------- */
  newPasswordInput.addEventListener("input", () => {
    newPasswordError.textContent = "";
    newPasswordInput.classList.remove("input-error");

    if (confirmNewInput.value) {
      if (confirmNewInput.value === newPasswordInput.value) {
        confirmNewError.textContent = "";
        confirmNewInput.classList.remove("input-error");
      } else {
        confirmNewError.textContent = "Passwords do not match.";
        confirmNewInput.classList.add("input-error");
      }
    }
  });

  confirmNewInput.addEventListener("input", () => {
    if (confirmNewInput.value === newPasswordInput.value) {
      confirmNewError.textContent = "";
      confirmNewInput.classList.remove("input-error");
    } else {
      confirmNewError.textContent = "Passwords do not match.";
      confirmNewInput.classList.add("input-error");
    }
  });

  currentPasswordInput.addEventListener("input", () => {
    currentPasswordError.textContent = "";
    currentPasswordInput.classList.remove("input-error");
  });

  /* -------------------------------------------------------------------------
   *  Change Password - form submission
   * ---------------------------------------------------------------------- */
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validatePasswordForm()) return;

    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = "Saving…";

    try {
      const response = await authFetch(API_CHANGE_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPasswordInput.value,
          new_password: newPasswordInput.value,
        }),
      });

      if (response.status === 400) {
        // The server rejected the current password
        showModal(wrongPasswordOverlay);
        return;
      }

      if (!response.ok) {
        showModal(serverErrOverlay);
        return;
      }

      // Success
      resetPasswordForm();
      showModal(passwordSuccessOverlay);
    } catch {
      showModal(serverErrOverlay);
    } finally {
      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = "Save New Password";
    }
  });

  /* -------------------------------------------------------------------------
   *  Logout
   * ---------------------------------------------------------------------- */
  logoutBtn.addEventListener("click", () => showModal(logoutOverlay));

  logoutCancel.addEventListener("click", () => hideModal(logoutOverlay));

  logoutOverlay.addEventListener("click", (e) => {
    if (e.target === logoutOverlay) hideModal(logoutOverlay);
  });

  logoutConfirm.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    location.replace("index.html");
  });

  /* -------------------------------------------------------------------------
   *  Delete Account
   * ---------------------------------------------------------------------- */
  deleteBtn.addEventListener("click", () => showModal(deleteAccountOverlay));

  deleteAccountCancel.addEventListener("click", () =>
    hideModal(deleteAccountOverlay),
  );

  deleteAccountOverlay.addEventListener("click", (e) => {
    if (e.target === deleteAccountOverlay) hideModal(deleteAccountOverlay);
  });

  deleteAccountConfirm.addEventListener("click", async () => {
    // Disable the confirm button immediately to prevent double-clicks on a slow connection from sending two DELETE requests.
    deleteAccountConfirm.disabled = true;
    deleteAccountConfirm.textContent = "Deleting…";

    try {
      const response = await authFetch(API_DELETE_ACCOUNT, {
        method: "DELETE",
      });

      if (!response.ok) {
        hideModal(deleteAccountOverlay);
        showModal(serverErrOverlay);
        return;
      }

      // Account is gone - clear local state and send to login page.
      localStorage.removeItem("access_token");
      location.replace("index.html");
    } catch {
      hideModal(deleteAccountOverlay);
      showModal(serverErrOverlay);
    } finally {
      deleteAccountConfirm.disabled = false;
      deleteAccountConfirm.textContent = "Yes, Delete My Account";
    }
  });

  /* -------------------------------------------------------------------------
   *  Modal close handlers - OK buttons
   * ---------------------------------------------------------------------- */
  passwordSuccessOk.addEventListener("click", () =>
    hideModal(passwordSuccessOverlay),
  );
  wrongPasswordOk.addEventListener("click", () => {
    hideModal(wrongPasswordOverlay);
    // Clear only the current-password field - the user needs to re-enter it, but keeping the new password fields avoids extra retyping.
    currentPasswordInput.value = "";
    currentPasswordInput.classList.remove("input-error");
    currentPasswordError.textContent = "";
    currentPasswordInput.focus();
  });
  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));

  // Outside-click close for informational modals
  [passwordSuccessOverlay, wrongPasswordOverlay, serverErrOverlay].forEach(
    (overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) hideModal(overlay);
      });
    },
  );

  /* -------------------------------------------------------------------------
   *  ESC key - closes any open modal except the delete-account confirmation
   *  (a destructive action should require an explicit button click).
   * ---------------------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (!logoutOverlay.hidden) hideModal(logoutOverlay);
    if (!passwordSuccessOverlay.hidden) hideModal(passwordSuccessOverlay);
    if (!serverErrOverlay.hidden) hideModal(serverErrOverlay);

    if (!wrongPasswordOverlay.hidden) {
      hideModal(wrongPasswordOverlay);
      currentPasswordInput.value = "";
      currentPasswordInput.classList.remove("input-error");
      currentPasswordError.textContent = "";
      currentPasswordInput.focus();
    }

    // deleteAccountOverlay intentionally excluded - ESC cannot confirm deletion.
  });
})();
