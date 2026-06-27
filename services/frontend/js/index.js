/**
 * Login page logic.
 * Depends on lang.js for user-visible strings via window.t().
 */
(() => {
  const API_LOGIN_URL = `${location.origin}/auth/login`;

  if (localStorage.getItem("access_token")) {
    location.replace("upload.html");
  }

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const loginBtn = document.getElementById("login-btn");

  const wrongCredsOverlay = document.getElementById(
    "wrong-credentials-overlay",
  );
  const wrongCredsOk = document.getElementById("wrong-credentials-ok");
  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");
  const accountLockedOverlay = document.getElementById(
    "account-locked-overlay",
  );
  const accountLockedBody = document.getElementById("al-body");
  const accountLockedOk = document.getElementById("account-locked-ok");

  const showModal = (overlay) => overlay.removeAttribute("hidden");
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /**
   * Validate login form fields, showing inline errors.
   * @returns {boolean}
   */
  const validateForm = () => {
    let valid = true;
    emailError.textContent = "";
    passwordError.textContent = "";
    emailInput.classList.remove("input-error");
    passwordInput.classList.remove("input-error");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      emailError.textContent = window.t("index.error.email_req");
      emailInput.classList.add("input-error");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError.textContent = window.t("index.error.email_fmt");
      emailInput.classList.add("input-error");
      valid = false;
    }

    if (!password) {
      passwordError.textContent = window.t("index.error.pass_req");
      passwordInput.classList.add("input-error");
      valid = false;
    }

    return valid;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    loginBtn.disabled = true;
    loginBtn.textContent = window.t("index.btn.submitting");

    try {
      const body = new URLSearchParams();
      body.append("username", emailInput.value.trim());
      body.append("password", passwordInput.value);

      const response = await fetch(API_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (response.status === 401) {
        showModal(wrongCredsOverlay);
        return;
      }

      if (response.status === 429) {
        // The server returns its own lockout message with the exact wait time.
        // We try to translate it; if it's an unrecognised format, show as-is.
        let message = window.t("index.locked.default");
        try {
          const errData = await response.json();
          if (errData.detail) {
            // Pattern: "Too many failed login attempts. Try again in N minutes, or contact..."
            // Replace the whole thing with our translatable version if it matches.
            const minutesMatch = errData.detail.match(
              /Try again in (\d+) minutes?/i,
            );
            if (minutesMatch) {
              message = window.t("index.locked.timed", {
                minutes: minutesMatch[1],
              });
            } else {
              message = errData.detail;
            }
          }
        } catch {
          /* non-JSON body - use default */
        }
        accountLockedBody.textContent = message;
        showModal(accountLockedOverlay);
        return;
      }

      if (!response.ok) {
        showModal(serverErrOverlay);
        return;
      }

      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      location.replace("upload.html");
    } catch {
      showModal(serverErrOverlay);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = window.t("index.btn.submit");
    }
  });

  // Re-sync button label on language change while the page is idle
  window.addEventListener("langchange", () => {
    if (!loginBtn.disabled) loginBtn.textContent = window.t("index.btn.submit");
  });

  emailInput.addEventListener("input", () => {
    emailError.textContent = "";
    emailInput.classList.remove("input-error");
  });

  passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
    passwordInput.classList.remove("input-error");
  });

  wrongCredsOk.addEventListener("click", () => {
    hideModal(wrongCredsOverlay);
    passwordInput.value = "";
    passwordInput.focus();
  });

  wrongCredsOverlay.addEventListener("click", (e) => {
    if (e.target === wrongCredsOverlay) {
      hideModal(wrongCredsOverlay);
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));
  serverErrOverlay.addEventListener("click", (e) => {
    if (e.target === serverErrOverlay) hideModal(serverErrOverlay);
  });

  accountLockedOk.addEventListener("click", () =>
    hideModal(accountLockedOverlay),
  );
  accountLockedOverlay.addEventListener("click", (e) => {
    if (e.target === accountLockedOverlay) hideModal(accountLockedOverlay);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!wrongCredsOverlay.hidden) {
      hideModal(wrongCredsOverlay);
      passwordInput.value = "";
      passwordInput.focus();
    }
    if (!serverErrOverlay.hidden) hideModal(serverErrOverlay);
    if (!accountLockedOverlay.hidden) hideModal(accountLockedOverlay);
  });
})();
