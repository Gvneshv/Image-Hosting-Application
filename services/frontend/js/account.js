/**
 * Account page logic.
 * Depends on lang.js for user-visible strings via window.t().
 */
(() => {
  const API_ME = `${location.origin}/auth/me`;
  const API_CHANGE_PASSWORD = `${location.origin}/auth/change-password`;
  const API_DELETE_ACCOUNT = `${location.origin}/auth/account`;

  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
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

  const back = document.getElementById("back-to-the-gallery-link");
  back.addEventListener("click", () => {
    window.location.href = "/upload.html#images";
  });

  const infoEmail = document.getElementById("info-email");
  const infoCreatedAt = document.getElementById("info-created-at");

  const changePasswordForm = document.getElementById("change-password-form");
  const currentPasswordInput = document.getElementById("current-password");
  const newPasswordInput = document.getElementById("new-password");
  const confirmNewInput = document.getElementById("confirm-new-password");
  const currentPasswordError = document.getElementById(
    "current-password-error",
  );
  const newPasswordError = document.getElementById("new-password-error");
  const confirmNewError = document.getElementById("confirm-new-password-error");
  const changePasswordBtn = document.getElementById("change-password-btn");

  const navButtons = document.querySelectorAll(".sidebar-btn");
  const sections = document.querySelectorAll(".account-section");
  const logoutBtn = document.getElementById("logout-btn");
  const deleteBtn = document.getElementById("delete-account-btn");

  const logoutOverlay = document.getElementById("logout-overlay");
  const logoutCancel = document.getElementById("logout-cancel");
  const logoutConfirm = document.getElementById("logout-confirm");
  const deleteAccountOverlay = document.getElementById(
    "delete-account-overlay",
  );
  const deleteAccountCancel = document.getElementById("delete-account-cancel");
  const deleteAccountConfirm = document.getElementById(
    "delete-account-confirm",
  );
  const passwordSuccessOverlay = document.getElementById(
    "password-success-overlay",
  );
  const passwordSuccessOk = document.getElementById("password-success-ok");
  const wrongPasswordOverlay = document.getElementById(
    "wrong-password-overlay",
  );
  const wrongPasswordOk = document.getElementById("wrong-password-ok");
  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");

  const showModal = (overlay) => overlay.removeAttribute("hidden");
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /* ---- Load user info ---- */
  const loadUserInfo = async () => {
    try {
      const response = await authFetch(API_ME);
      if (!response.ok) {
        infoEmail.textContent = window.t("account.info.load_err");
        infoCreatedAt.textContent = window.t("account.info.load_err");
        return;
      }
      const user = await response.json();
      infoEmail.textContent = user.email;
      infoCreatedAt.textContent = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(user.created_at));
    } catch {
      infoEmail.textContent = window.t("account.info.load_err");
      infoCreatedAt.textContent = window.t("account.info.load_err");
    }
  };

  loadUserInfo();

  /* ---- Sidebar navigation ---- */
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      navButtons.forEach((b) => b.classList.remove("sidebar-btn--active"));
      btn.classList.add("sidebar-btn--active");
      sections.forEach((s) => s.classList.add("account-section--hidden"));
      document
        .getElementById(targetId)
        ?.classList.remove("account-section--hidden");
      if (targetId !== "section-password") resetPasswordForm();
    });
  });

  /* ---- Change Password - validation ---- */

  /**
   * Validate the change-password form, showing inline error messages.
   * @returns {boolean}
   */
  const validatePasswordForm = () => {
    let valid = true;
    let firstInvalid = null;

    [currentPasswordInput, newPasswordInput, confirmNewInput].forEach((el) =>
      el.classList.remove("input-error"),
    );
    currentPasswordError.textContent = "";
    newPasswordError.textContent = "";
    confirmNewError.textContent = "";

    const current = currentPasswordInput.value;
    const next = newPasswordInput.value;
    const confirm = confirmNewInput.value;

    if (!current) {
      currentPasswordError.textContent = window.t(
        "account.pw.error.current_req",
      );
      currentPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? currentPasswordInput;
      valid = false;
    }

    if (!next) {
      newPasswordError.textContent = window.t("account.pw.error.new_req");
      newPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? newPasswordInput;
      valid = false;
    } else if (next.length < 8) {
      newPasswordError.textContent = window.t("account.pw.error.new_min");
      newPasswordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? newPasswordInput;
      valid = false;
    }

    if (!confirm) {
      confirmNewError.textContent = window.t("account.pw.error.confirm_req");
      confirmNewInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmNewInput;
      valid = false;
    } else if (confirm !== next) {
      confirmNewError.textContent = window.t(
        "account.pw.error.confirm_mismatch",
      );
      confirmNewInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmNewInput;
      valid = false;
    }

    firstInvalid?.focus();
    return valid;
  };

  /** Clear all change-password form state. */
  const resetPasswordForm = () => {
    changePasswordForm.reset();
    [currentPasswordInput, newPasswordInput, confirmNewInput].forEach((el) =>
      el.classList.remove("input-error"),
    );
    currentPasswordError.textContent = "";
    newPasswordError.textContent = "";
    confirmNewError.textContent = "";
  };

  /* ---- Change Password - live confirm feedback ---- */
  newPasswordInput.addEventListener("input", () => {
    newPasswordError.textContent = "";
    newPasswordInput.classList.remove("input-error");
    if (confirmNewInput.value) {
      const match = confirmNewInput.value === newPasswordInput.value;
      confirmNewError.textContent = match
        ? ""
        : window.t("account.pw.error.confirm_mismatch");
      confirmNewInput.classList.toggle("input-error", !match);
    }
  });

  confirmNewInput.addEventListener("input", () => {
    const match = confirmNewInput.value === newPasswordInput.value;
    confirmNewError.textContent = match
      ? ""
      : window.t("account.pw.error.confirm_mismatch");
    confirmNewInput.classList.toggle("input-error", !match);
  });

  currentPasswordInput.addEventListener("input", () => {
    currentPasswordError.textContent = "";
    currentPasswordInput.classList.remove("input-error");
  });

  /* ---- Change Password - submit ---- */
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;

    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = window.t("account.btn.saving");

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
        showModal(wrongPasswordOverlay);
        return;
      }
      if (!response.ok) {
        showModal(serverErrOverlay);
        return;
      }

      resetPasswordForm();
      showModal(passwordSuccessOverlay);
    } catch {
      showModal(serverErrOverlay);
    } finally {
      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = window.t("account.btn.pw_submit");
    }
  });

  // Re-sync button label on language change while idle
  window.addEventListener("langchange", () => {
    if (!changePasswordBtn.disabled) {
      changePasswordBtn.textContent = window.t("account.btn.pw_submit");
    }
    if (!deleteAccountConfirm.disabled) {
      deleteAccountConfirm.textContent = window.t(
        "account.modal.delete.confirm",
      );
    }
  });

  /* ---- Logout ---- */
  logoutBtn.addEventListener("click", () => showModal(logoutOverlay));
  logoutCancel.addEventListener("click", () => hideModal(logoutOverlay));
  logoutOverlay.addEventListener("click", (e) => {
    if (e.target === logoutOverlay) hideModal(logoutOverlay);
  });
  logoutConfirm.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    location.replace("index.html");
  });

  /* ---- Delete Account ---- */
  deleteBtn.addEventListener("click", () => showModal(deleteAccountOverlay));
  deleteAccountCancel.addEventListener("click", () =>
    hideModal(deleteAccountOverlay),
  );
  deleteAccountOverlay.addEventListener("click", (e) => {
    if (e.target === deleteAccountOverlay) hideModal(deleteAccountOverlay);
  });

  deleteAccountConfirm.addEventListener("click", async () => {
    deleteAccountConfirm.disabled = true;
    deleteAccountConfirm.textContent = window.t("account.btn.deleting");

    try {
      const response = await authFetch(API_DELETE_ACCOUNT, {
        method: "DELETE",
      });
      if (!response.ok) {
        hideModal(deleteAccountOverlay);
        showModal(serverErrOverlay);
        return;
      }
      localStorage.removeItem("access_token");
      location.replace("index.html");
    } catch {
      hideModal(deleteAccountOverlay);
      showModal(serverErrOverlay);
    } finally {
      deleteAccountConfirm.disabled = false;
      deleteAccountConfirm.textContent = window.t(
        "account.modal.delete.confirm",
      );
    }
  });

  /* ---- Modal close handlers ---- */
  passwordSuccessOk.addEventListener("click", () =>
    hideModal(passwordSuccessOverlay),
  );

  wrongPasswordOk.addEventListener("click", () => {
    hideModal(wrongPasswordOverlay);
    currentPasswordInput.value = "";
    currentPasswordInput.classList.remove("input-error");
    currentPasswordError.textContent = "";
    currentPasswordInput.focus();
  });

  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));

  [passwordSuccessOverlay, wrongPasswordOverlay, serverErrOverlay].forEach(
    (overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) hideModal(overlay);
      });
    },
  );

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
