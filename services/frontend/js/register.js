/**
 * Registration page logic
 *
 * Responsibilities:
 *  1. Auth guard - redirect already-authenticated users to upload.html.
 *  2. Client-side form validation before hitting the network.
 *  3. POST /auth/register - create a new account.
 *  4. Show success modal, then auto-redirect to index.html after a short delay.
 *  5. Wire up modals for email-already-taken (400) and server errors (5xx).
 *
 * No token is stored here - registration does not log the user in.
 * They are redirected to the login page and must sign in explicitly.
 */

(() => {
  /* -------------------------------------------------------------------------
   *  API endpoint
   * ---------------------------------------------------------------------- */
  const API_REGISTER_URL = `${location.origin}/auth/register`;

  /* -------------------------------------------------------------------------
   *  Auth guard - same pattern as index.js.
   *  A logged-in user has no reason to register a second account.
   * ---------------------------------------------------------------------- */
  if (localStorage.getItem("access_token")) {
    location.replace("upload.html");
  }

  /* -------------------------------------------------------------------------
   *  DOM references
   * ---------------------------------------------------------------------- */
  const form = document.getElementById("register-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm-password");
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const confirmError = document.getElementById("confirm-password-error");
  const registerBtn = document.getElementById("register-btn");

  // Modals
  const emailTakenOverlay = document.getElementById("email-taken-overlay");
  const emailTakenOk = document.getElementById("email-taken-ok");
  const successOverlay = document.getElementById("register-success-overlay");
  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");

  /* -------------------------------------------------------------------------
   *  Modal helpers - `hidden` attribute pattern (same as index.js)
   * ---------------------------------------------------------------------- */

  /** Show a modal overlay by removing its `hidden` attribute. */
  const showModal = (overlay) => overlay.removeAttribute("hidden");

  /** Hide a modal overlay by setting its `hidden` attribute. */
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /* -------------------------------------------------------------------------
   *  Inline field validation
   *
   *  Rules:
   *   - Email: required + basic format check
   *   - Password: required + minimum 8 characters (matches backend minlength)
   *   - Confirm password: required + must match password
   *
   *  All three fields are checked on every submit; the first invalid field
   *  receives focus so the user knows where to start.
   * ---------------------------------------------------------------------- */

  /**
   * Validate all registration fields and display inline error messages.
   * @returns {boolean} true if all fields pass validation.
   */
  const validateForm = () => {
    let valid = true;
    let firstInvalid = null;

    // Clear previous error state
    [emailInput, passwordInput, confirmInput].forEach((input) => {
      input.classList.remove("input-error");
    });
    emailError.textContent = "";
    passwordError.textContent = "";
    confirmError.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!email) {
      emailError.textContent = "Email is required.";
      emailInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? emailInput;
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError.textContent = "Enter a valid email address.";
      emailInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? emailInput;
      valid = false;
    }

    if (!password) {
      passwordError.textContent = "Password is required.";
      passwordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? passwordInput;
      valid = false;
    } else if (password.length < 8) {
      passwordError.textContent = "Password must be at least 8 characters.";
      passwordInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? passwordInput;
      valid = false;
    }

    if (!confirm) {
      confirmError.textContent = "Please confirm your password.";
      confirmInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmInput;
      valid = false;
    } else if (confirm !== password) {
      confirmError.textContent = "Passwords do not match.";
      confirmInput.classList.add("input-error");
      firstInvalid = firstInvalid ?? confirmInput;
      valid = false;
    }

    firstInvalid?.focus();
    return valid;
  };

  /* -------------------------------------------------------------------------
   *  Form submission
   * ---------------------------------------------------------------------- */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    registerBtn.disabled = true;
    registerBtn.textContent = "Creating Account…";

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
        // Email already registered
        showModal(emailTakenOverlay);
        return;
      }

      if (!response.ok) {
        showModal(serverErrOverlay);
        return;
      }

      // Success - show the confirmation modal, then redirect after a short delay so the user has time to read the message.
      showModal(successOverlay);
      setTimeout(() => location.replace("index.html"), 2500);
    } catch {
      // Network failure
      showModal(serverErrOverlay);
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = "Create Account";
    }
  });

  /* -------------------------------------------------------------------------
   *  Clear error state as the user edits each field
   * ---------------------------------------------------------------------- */
  emailInput.addEventListener("input", () => {
    emailError.textContent = "";
    emailInput.classList.remove("input-error");
  });

  passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
    passwordInput.classList.remove("input-error");

    // Re-validate confirm field live if it already has a value - so the "passwords do not match" error clears as the user types.
    if (confirmInput.value) {
      if (confirmInput.value === passwordInput.value) {
        confirmError.textContent = "";
        confirmInput.classList.remove("input-error");
      } else {
        confirmError.textContent = "Passwords do not match.";
        confirmInput.classList.add("input-error");
      }
    }
  });

  confirmInput.addEventListener("input", () => {
    if (confirmInput.value === passwordInput.value) {
      confirmError.textContent = "";
      confirmInput.classList.remove("input-error");
    } else {
      confirmError.textContent = "Passwords do not match.";
      confirmInput.classList.add("input-error");
    }
  });

  /* -------------------------------------------------------------------------
   *  Modal close handlers
   * ---------------------------------------------------------------------- */

  // Email taken - OK button
  emailTakenOk.addEventListener("click", () => {
    hideModal(emailTakenOverlay);
    emailInput.select(); // pre-select the email so user can retype easily
    emailInput.focus();
  });

  // Email taken - click outside
  emailTakenOverlay.addEventListener("click", (e) => {
    if (e.target === emailTakenOverlay) {
      hideModal(emailTakenOverlay);
      emailInput.select();
      emailInput.focus();
    }
  });

  // Server error - OK button
  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));

  // Server error - click outside
  serverErrOverlay.addEventListener("click", (e) => {
    if (e.target === serverErrOverlay) hideModal(serverErrOverlay);
  });

  /*
   * The success modal has no close button and no outside-click handler - it is dismissed only by the auto-redirect after 2.5 seconds.
   * Blocking interaction at this point avoids the user clicking around during the redirect and landing in an unexpected state.
   */

  // ESC key closes dismissible modals (not the success modal)
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
