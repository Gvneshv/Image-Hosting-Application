/**
 * Registration page logic.
 * Depends on lang.js for user-visible strings via window.t().
 */
(() => {
  const API_REGISTER_URL = `${location.origin}/auth/register`;

  if (localStorage.getItem("access_token")) {
    location.replace("upload.html");
  }

  const form = document.getElementById("register-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm-password");
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const confirmError = document.getElementById("confirm-password-error");
  const registerBtn = document.getElementById("register-btn");

  const emailTakenOverlay = document.getElementById("email-taken-overlay");
  const emailTakenOk = document.getElementById("email-taken-ok");
  const successOverlay = document.getElementById("register-success-overlay");
  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");

  const showModal = (overlay) => overlay.removeAttribute("hidden");
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /**
   * Validate all registration fields, displaying inline errors.
   * @returns {boolean}
   */
  const validateForm = () => {
    let valid = true;
    let firstInvalid = null;

    [emailInput, passwordInput, confirmInput].forEach((el) =>
      el.classList.remove("input-error"),
    );
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmError.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!email) {
      emailError.textContent = window.t("register.error.email_req");
      emailInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? emailInput;
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError.textContent = window.t("register.error.email_fmt");
      emailInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? emailInput;
      valid = false;
    }

    if (!password) {
      passwordError.textContent = window.t("register.error.pass_req");
      passwordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? passwordInput;
      valid = false;
    } else if (password.length < 8) {
      passwordError.textContent = window.t("register.error.pass_min");
      passwordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? passwordInput;
      valid = false;
    }

    if (!confirm) {
      confirmError.textContent = window.t("register.error.confirm_req");
      confirmInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmInput;
      valid = false;
    } else if (confirm !== password) {
      confirmError.textContent = window.t("register.error.confirm_mismatch");
      confirmInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmInput;
      valid = false;
    }

    firstInvalid?.focus();
    return valid;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    registerBtn.disabled = true;
    registerBtn.textContent = window.t("register.btn.submitting");

    try {
      const response = await fetch(API_REGISTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        }),
      });

      if (response.status === 400) {
        showModal(emailTakenOverlay);
        return;
      }
      if (!response.ok) {
        showModal(serverErrOverlay);
        return;
      }

      showModal(successOverlay);
      setTimeout(() => location.replace("index.html"), 2500);
    } catch {
      showModal(serverErrOverlay);
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = window.t("register.btn.submit");
    }
  });

  window.addEventListener("langchange", () => {
    if (!registerBtn.disabled)
      registerBtn.textContent = window.t("register.btn.submit");
  });

  emailInput.addEventListener("input", () => {
    emailError.textContent = "";
    emailInput.classList.remove("input-error");
  });

  passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
    passwordInput.classList.remove("input-error");
    if (confirmInput.value) {
      confirmError.textContent =
        confirmInput.value === passwordInput.value
          ? ""
          : window.t("register.error.confirm_mismatch");
      confirmInput.classList.toggle(
        "input-error",
        confirmInput.value !== passwordInput.value,
      );
    }
  });

  confirmInput.addEventListener("input", () => {
    confirmError.textContent =
      confirmInput.value === passwordInput.value
        ? ""
        : window.t("register.error.confirm_mismatch");
    confirmInput.classList.toggle(
      "input-error",
      confirmInput.value !== passwordInput.value,
    );
  });

  emailTakenOk.addEventListener("click", () => {
    hideModal(emailTakenOverlay);
    emailInput.select();
    emailInput.focus();
  });

  emailTakenOverlay.addEventListener("click", (e) => {
    if (e.target === emailTakenOverlay) {
      hideModal(emailTakenOverlay);
      emailInput.select();
      emailInput.focus();
    }
  });

  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));
  serverErrOverlay.addEventListener("click", (e) => {
    if (e.target === serverErrOverlay) hideModal(serverErrOverlay);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!emailTakenOverlay.hidden) {
      hideModal(emailTakenOverlay);
      emailInput.select();
      emailInput.focus();
    }
    if (!serverErrOverlay.hidden) hideModal(serverErrOverlay);
  });
})();
