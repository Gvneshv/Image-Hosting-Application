/**
 * Login page logic
 *
 * Responsibilities:
 *  1. Auth guard - redirect already-authenticated users to upload.html
 *     so they never see the login page while holding a valid token.
 *  2. Client-side form validation before hitting the network.
 *  3. POST /auth/login - exchange credentials for a JWT.
 *  4. Persist the token in localStorage and redirect on success.
 *  5. Wire up modals for wrong credentials and server errors.
 *
 * Token storage:
 *  The access token is stored under the key "access_token" in localStorage.
 *  Every authenticated page (upload.html, account.html) reads this key and
 *  sends it as `Authorization: Bearer <token>` on every API request.
 *  On logout (account.js) the key is simply removed.
 */

(() => {
  /* -------------------------------------------------------------------------
   *  API endpoint - resolved relative to the current origin so it works
   *  both through the nginx reverse proxy and during direct-to-FastAPI
   *  development (provided the dev server is on the same origin).
   * ---------------------------------------------------------------------- */
  const API_LOGIN_URL = `${location.origin}/auth/login`;

  /* -------------------------------------------------------------------------
   *  Auth guard - runs synchronously before any DOM interaction.
   *  If a token already exists we skip rendering entirely and bounce the
   *  user to the gallery.  This prevents a flash of the login form.
   * ---------------------------------------------------------------------- */
  if (localStorage.getItem("access_token")) {
    location.replace("upload.html");
    // `replace` removes this page from browser history so the back button
    // after login does not return the user to an empty login screen.
  }

  /* -------------------------------------------------------------------------
   *  DOM references
   * ---------------------------------------------------------------------- */
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const loginBtn = document.getElementById("login-btn");

  // Modals
  const wrongCredsOverlay = document.getElementById(
    "wrong-credentials-overlay",
  );
  const wrongCredsOk = document.getElementById("wrong-credentials-ok");
  const serverErrOverlay = document.getElementById("server-error-overlay");
  const serverErrOk = document.getElementById("server-error-ok");

  /* -------------------------------------------------------------------------
   *  Modal helpers
   *
   *  The auth pages use the `hidden` attribute pattern (HTML-native), not the
   *  `.show` class used by modal.js on the upload page.  Showing a modal is
   *  just `overlay.removeAttribute('hidden')`; hiding is `overlay.hidden = true`.
   * ---------------------------------------------------------------------- */

  /** Show a modal overlay (removes the `hidden` attribute). */
  const showModal = (overlay) => overlay.removeAttribute("hidden");

  /** Hide a modal overlay (sets the `hidden` attribute). */
  const hideModal = (overlay) => {
    overlay.hidden = true;
  };

  /* -------------------------------------------------------------------------
   *  Inline field validation
   *
   *  We validate on submit rather than on every keystroke to avoid nagging.
   *  The `input-error` CSS class (defined in auth.css) turns the border red.
   *  Returns true when all fields are valid.
   * ---------------------------------------------------------------------- */

  /**
   * Validate the login form fields and display inline error messages.
   * @returns {boolean} true if all fields pass validation.
   */
  const validateForm = () => {
    let valid = true;

    // Clear previous error state
    emailError.textContent = "";
    passwordError.textContent = "";
    emailInput.classList.remove("input-error");
    passwordInput.classList.remove("input-error");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      emailError.textContent = "Email is required.";
      emailInput.classList.add("input-error");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Lightweight format check - the server validates authoritatively.
      emailError.textContent = "Enter a valid email address.";
      emailInput.classList.add("input-error");
      valid = false;
    }

    if (!password) {
      passwordError.textContent = "Password is required.";
      passwordInput.classList.add("input-error");
      valid = false;
    }

    return valid;
  };

  /* -------------------------------------------------------------------------
   *  Form submission
   * ---------------------------------------------------------------------- */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Disable the button while the request is in flight to prevent
    // duplicate submissions on slow connections.
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing In…";

    try {
      /*
       * FastAPI's OAuth2PasswordRequestForm expects the body as
       * application/x-www-form-urlencoded with `username` and `password`
       * fields.  Our users log in with an email, but the field name on
       * the wire must remain `username` to match the form schema.
       */
      const body = new URLSearchParams();
      body.append("username", emailInput.value.trim());
      body.append("password", passwordInput.value);

      const response = await fetch(API_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (response.status === 401) {
        // Wrong email or password - show the specific modal
        showModal(wrongCredsOverlay);
        return;
      }

      if (!response.ok) {
        // Any other non-2xx (e.g. 500, 503) is a generic server error
        showModal(serverErrOverlay);
        return;
      }

      const data = await response.json();

      // Store the token; every subsequent page reads it from here
      localStorage.setItem("access_token", data.access_token);

      // Navigate to the gallery - replace so back doesn't loop to login
      location.replace("upload.html");
    } catch {
      // Network failure (fetch itself threw) - treat as server error
      showModal(serverErrOverlay);
    } finally {
      // Re-enable the button regardless of outcome (modal still visible)
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  });

  /* -------------------------------------------------------------------------
   *  Clear the error state on a field as soon as the user starts typing -
   *  avoids leaving stale red borders after a failed attempt.
   * ---------------------------------------------------------------------- */
  emailInput.addEventListener("input", () => {
    emailError.textContent = "";
    emailInput.classList.remove("input-error");
  });

  passwordInput.addEventListener("input", () => {
    passwordError.textContent = "";
    passwordInput.classList.remove("input-error");
  });

  /* -------------------------------------------------------------------------
   *  Modal close handlers
   * ---------------------------------------------------------------------- */

  // Wrong credentials - OK button
  wrongCredsOk.addEventListener("click", () => {
    hideModal(wrongCredsOverlay);
    passwordInput.value = ""; // clear password so user can retype cleanly
    passwordInput.focus();
  });

  // Wrong credentials - click outside the modal card
  wrongCredsOverlay.addEventListener("click", (e) => {
    if (e.target === wrongCredsOverlay) {
      hideModal(wrongCredsOverlay);
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  // Server error - OK button
  serverErrOk.addEventListener("click", () => hideModal(serverErrOverlay));

  // Server error - click outside
  serverErrOverlay.addEventListener("click", (e) => {
    if (e.target === serverErrOverlay) hideModal(serverErrOverlay);
  });

  // ESC key closes whichever modal is currently open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!wrongCredsOverlay.hidden) {
      hideModal(wrongCredsOverlay);
      passwordInput.value = "";
      passwordInput.focus();
    }
    if (!serverErrOverlay.hidden) hideModal(serverErrOverlay);
  });
})();
