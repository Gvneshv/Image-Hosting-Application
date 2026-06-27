/**
 * Image-host frontend logic for upload.html.
 *
 * Responsibilities:
 *  - Auth guard: redirects unauthenticated visitors to index.html
 *  - Account icon: derives initials from the JWT and populates the icon element
 *  - Admin icon: revealed only after GET /auth/me confirms is_admin
 *  - Upload via file-input button or drag-and-drop
 *  - Gallery: paginated image list with sort/filter controls
 *  - Delete images from the gallery
 *
 * Depends on lang.js (loaded before this script) for all user-visible strings
 * via window.t(). Re-renders dynamic controls on "langchange" events.
 */
(async () => {
  /* ------------------------------------------------------------------
   *  AUTH GUARD
   * ------------------------------------------------------------------ */
  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
    return; // stop execution; the async IIFE must return explicitly
  }

  /* ------------------------------------------------------------------
   *  AUTH FETCH HELPER
   *  Defined first - every other function uses it.
   * ------------------------------------------------------------------ */
  /**
   * Fetch wrapper that attaches the Bearer token and handles global 401.
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

  /* ------------------------------------------------------------------
   *  ACCOUNT ICON - derive initials from the JWT email claim
   * ------------------------------------------------------------------ */
  (() => {
    try {
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      const email = payload?.sub ?? payload?.email ?? "";
      if (!email) return;

      const parts = email
        .split("@")[0]
        .split(/[^a-zA-Z]+/)
        .filter(Boolean);
      const initials = parts
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
      if (!initials) return;

      const iconEl = document.getElementById("account-icon");
      if (!iconEl) return;
      iconEl.textContent = initials;
      iconEl.setAttribute("aria-label", email);
    } catch {
      // Malformed token - leave the default SVG in place.
    }
  })();

  /* ------------------------------------------------------------------
   *  ADMIN ICON - revealed only after server confirms is_admin
   * ------------------------------------------------------------------ */
  /**
   * Call GET /auth/me and remove [hidden] from the admin icon if is_admin.
   * Never trusts the JWT payload for this - only the server response.
   */
  const revealAdminIconIfAdmin = async () => {
    try {
      const res = await authFetch(`${location.origin}/auth/me`);
      if (!res.ok) return;
      const me = await res.json();
      if (me.is_admin) {
        document.getElementById("admin-icon-link")?.removeAttribute("hidden");
      }
    } catch {
      // Network failure - icon stays hidden, no user-facing impact.
    }
  };

  /* ------------------------------------------------------------------
   *  CONSTANTS
   * ------------------------------------------------------------------ */
  const API_UPLOAD_URL = `${location.origin}/upload/`;
  const API_IMAGES_URL = `${location.origin}/upload`;
  const API_DELETE_URL = (fn) =>
    `${location.origin}/upload/${encodeURIComponent(fn)}`;

  /** Shorthand querySelector. */
  const $ = (s) => document.querySelector(s);

  /* ------------------------------------------------------------------
   *  SHARED HELPERS
   * ------------------------------------------------------------------ */

  /**
   * Update the upload-pad status text element.
   * @param {HTMLElement} el
   * @param {string} msg
   * @param {boolean} [isErr=false]
   */
  const showStatus = (el, msg, isErr = false) => {
    el.classList.toggle("upload-error", isErr);
    el.classList.toggle("upload-main-text", !isErr);
    el.textContent = msg;
  };

  /**
   * Create a centred status paragraph (used for empty-gallery state).
   * @param {string} txt
   * @returns {HTMLParagraphElement}
   */
  const createMsg = (txt) => {
    const p = document.createElement("p");
    p.textContent = txt;
    p.className = "no-images-msg";
    p.style.cssText = "text-align:center;color:var(--color-text-secondary)";
    return p;
  };

  /**
   * Copy text to clipboard, falling back to execCommand for HTTP/older browsers.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  /* ------------------------------------------------------------------
   *  UPLOAD TAB
   * ------------------------------------------------------------------ */
  /**
   * Wire up the file-input button, drag-and-drop area, and the URL copy button.
   * @param {() => void} onUploadSuccess - Called after a successful upload to refresh the gallery.
   */
  function initUploader(onUploadSuccess) {
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");
    const resultInput = document.getElementById("resultLink");
    const copyBtn = document.getElementById("copyBtn");
    // The pad text el has either class depending on state; query the parent element
    const uploadText = document.getElementById("upload-main-text");

    if (!uploadArea || !fileInput || !resultInput || !copyBtn || !uploadText)
      return;

    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

    /**
     * Validate and POST a single file to the server.
     * @param {File} file
     */
    const uploadFile = async (file) => {
      if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        showStatus(uploadText, window.t("upload.error.type"), true);
        return;
      }
      if (file.size > MAX_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        showStatus(
          uploadText,
          window.t("upload.error.size_client", { size: sizeMB }),
          true,
        );
        return;
      }

      showStatus(uploadText, window.t("upload.status.uploading"), false);

      try {
        const form = new FormData();
        form.append("file", file);

        const response = await authFetch(API_UPLOAD_URL, {
          method: "POST",
          body: form,
        });

        if (response.status === 413) {
          showStatus(uploadText, window.t("upload.error.size_server"), true);
          return;
        }
        if (response.status === 400) {
          try {
            const err = await response.json();
            showStatus(
              uploadText,
              `${window.t("upload.error.invalid")}: ${err.detail}`,
              true,
            );
          } catch {
            showStatus(uploadText, window.t("upload.error.invalid"), true);
          }
          return;
        }
        if (response.status === 429) {
          showStatus(uploadText, window.t("upload.error.rate_limit"), true);
          return;
        }
        if (!response.ok) {
          showStatus(
            uploadText,
            window.t("upload.error.server", { status: response.status }),
            true,
          );
          return;
        }

        const result = await response.json();
        showStatus(
          uploadText,
          window.t("upload.status.success") + result.filename,
        );

        onUploadSuccess();

        const imageUrl = result.url.startsWith("http")
          ? result.url
          : `${location.origin}${result.url}`;
        resultInput.value = imageUrl;
      } catch (e) {
        console.error("Upload error:", e);
        showStatus(
          uploadText,
          window.t("upload.error.server", { status: e.message }),
          true,
        );
      }
    };

    // File-input button
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file) uploadFile(file);
      fileInput.value = "";
    });

    // URL copy button
    copyBtn.addEventListener("click", async () => {
      if (!resultInput.value) return;
      try {
        await copyToClipboard(resultInput.value);
        copyBtn.textContent = window.t("upload.copy.copied");
        setTimeout(
          () => (copyBtn.textContent = window.t("upload.copy.default")),
          1500,
        );
      } catch (err) {
        alert(window.t("upload.gallery.fail_copy", { error: err.message }));
      }
    });

    // Re-sync copy button label on language change (in case it's mid-"Copied!" timeout)
    window.addEventListener("langchange", () => {
      if (copyBtn.textContent !== window.t("upload.copy.copied")) {
        copyBtn.textContent = window.t("upload.copy.default");
      }
    });

    // ---- Drag-and-drop ----
    // Prevent browser from opening the file on accidental drop anywhere
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      uploadArea.addEventListener(ev, (e) => e.preventDefault(), false);
    });

    uploadArea.addEventListener("dragenter", () =>
      uploadArea.classList.add("dragover"),
    );
    uploadArea.addEventListener("dragover", () =>
      uploadArea.classList.add("dragover"),
    );
    uploadArea.addEventListener("dragleave", () =>
      uploadArea.classList.remove("dragover"),
    );
    uploadArea.addEventListener("drop", (e) => {
      uploadArea.classList.remove("dragover");
      const file = e.dataTransfer?.files[0];
      if (file) uploadFile(file);
    });
  }

  /* ------------------------------------------------------------------
   *  IMAGES TAB
   * ------------------------------------------------------------------ */
  /**
   * Initialise the Images tab: per-page/sort controls, image grid, pagination.
   * @returns {{ loadImages: () => Promise<void> }}
   */
  function initImagesTab() {
    const imgSection = document.getElementById("images-tab");
    const table = document.querySelector(".hidden-table");
    const imgTabBtn = document.querySelector('.toggle-tab[data-tab="images"]');

    if (!imgSection || !table || !imgTabBtn) return { loadImages: () => {} };

    // Pagination / sort state
    let currentPage = 1;
    let per_page = 6;
    let totalPages = 1;
    let sort_by = "upload_time";
    let sort_order = "desc";
    let hasLoadedOnce = false;

    // ---- Per-page / sort controls ----

    /**
     * Inject (or re-inject) the per-page / sort controls with current-language labels.
     * Preserves the current select values across rebuilds (e.g. on langchange).
     */
    const buildControls = () => {
      const prevPerPage =
        table.querySelector("#perPageSelect")?.value ?? String(per_page);
      const prevSortField = table.querySelector("#sortField")?.value ?? sort_by;
      const prevSortOrder =
        table.querySelector("#sortOrder")?.value ?? sort_order;

      table.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.className = "perpage-controls";
      wrap.innerHTML = `
        <label>${window.t("controls.per_page")}
          <select id="perPageSelect">
            <option value="3">3</option>
            <option value="6">6</option>
            <option value="9">9</option>
          </select>
        </label>
        <label>${window.t("controls.sort_by")}
          <select id="sortField">
            <option value="upload_time">${window.t("controls.sort.time")}</option>
            <option value="filename">${window.t("controls.sort.name")}</option>
            <option value="size">${window.t("controls.sort.size")}</option>
          </select>
        </label>
        <label>${window.t("controls.order")}
          <select id="sortOrder">
            <option value="asc">${window.t("controls.order.asc")}</option>
            <option value="desc">${window.t("controls.order.desc")}</option>
          </select>
        </label>
      `;
      table.appendChild(wrap);

      wrap.querySelector("#perPageSelect").value = prevPerPage;
      wrap.querySelector("#sortField").value = prevSortField;
      wrap.querySelector("#sortOrder").value = prevSortOrder;

      wrap.querySelector("#perPageSelect").addEventListener("change", (e) => {
        per_page = parseInt(e.target.value);
        currentPage = 1;
        loadImages();
      });
      wrap.querySelector("#sortField").addEventListener("change", (e) => {
        sort_by = e.target.value;
        currentPage = 1;
        loadImages();
      });
      wrap.querySelector("#sortOrder").addEventListener("change", (e) => {
        sort_order = e.target.value;
        currentPage = 1;
        loadImages();
      });
    };

    buildControls();

    // ---- Pagination row ----

    const paginationContainer = document.createElement("div");
    paginationContainer.className = "pagination-container";
    imgSection.appendChild(paginationContainer);

    /** Re-render pagination buttons and page-info text with current-language labels. */
    const renderPagination = () => {
      paginationContainer.innerHTML = `
        <button id="prevBtn">${window.t("controls.prev")}</button>
        <span id="pageInfo">${window.t("upload.page_info", { current: currentPage, total: totalPages })}</span>
        <button id="nextBtn">${window.t("controls.next")}</button>
      `;
      const prevBtn = paginationContainer.querySelector("#prevBtn");
      const nextBtn = paginationContainer.querySelector("#nextBtn");

      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;

      prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          loadImages();
        }
      });
      nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          loadImages();
        }
      });
    };

    // ---- Empty / loaded state ----

    const showEmptyState = () => {
      table.style.display = "none";
      paginationContainer.style.display = "none";
      imgSection.querySelectorAll(".no-images-msg").forEach((n) => n.remove());
      imgSection.appendChild(createMsg(window.t("upload.gallery.empty")));
    };

    const showLoadedState = () => {
      table.style.display = "";
      paginationContainer.style.display = "flex";
    };

    // ---- Delete ----

    /**
     * Confirm and DELETE a single image, then remove its card from the DOM.
     * @param {string} uniqueName
     * @param {HTMLElement} cell
     */
    const deleteImage = async (uniqueName, cell) => {
      const confirmed = await customConfirm(
        window.t("dialog.delete.body"),
        window.t("dialog.delete.title"),
        {
          confirmText: window.t("dialog.delete.confirm"),
          cancelText: window.t("dialog.delete.cancel"),
          icon: "🗑️",
          iconClass: "warning",
        },
      );
      if (!confirmed) return;

      try {
        const res = await authFetch(API_DELETE_URL(uniqueName), {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        cell.remove();
        if (!table.querySelector(".image-element")) showEmptyState();
      } catch (e) {
        await customAlert(
          window.t("upload.gallery.fail_delete", { error: e.message }),
          window.t("dialog.delete_err.title"),
          { icon: "✕", iconClass: "error" },
        );
      }
    };

    // ---- Load & render images ----

    /**
     * Fetch the current page of images from the API and render image cards.
     */
    const loadImages = async () => {
      table.querySelectorAll(".image-element").forEach((n) => n.remove());
      imgSection.querySelectorAll(".no-images-msg").forEach((n) => n.remove());

      try {
        const res = await authFetch(
          `${API_IMAGES_URL}?page=${currentPage}&per_page=${per_page}&sort_by=${sort_by}&sort_order=${sort_order}`,
        );

        if (res.status === 404) {
          showEmptyState();
          hasLoadedOnce = true;
          return;
        }
        if (!res.ok) {
          showEmptyState();
          return;
        }

        const result = await res.json();
        const images = result.images;
        totalPages = result.pages;

        if (!images || !images.length) {
          showEmptyState();
          hasLoadedOnce = true;
          return;
        }

        showLoadedState();
        hasLoadedOnce = true;

        images.forEach(({ filename, unique_name }) => {
          const imageUrl = `/images/${unique_name}`;
          const cell = document.createElement("div");
          cell.className = "image-element";
          cell.innerHTML = `
            <div class="image" data-filename="${filename}" style="background-image: url(${imageUrl});" alt="${filename}">
              <button class="new-tab"></button>
            </div>
            <div class="image-beneath">
              <div class="image-buttons-container">
                <button class="copy-button copyBtn">${window.t("upload.gallery.copy")}</button>
                <button class="delete-button">🗑️</button>
              </div>
            </div>`;

          cell
            .querySelector(".delete-button")
            .addEventListener("click", () => deleteImage(unique_name, cell));

          const imgDiv = cell.querySelector(".image");
          imgDiv.addEventListener("click", () => {
            window.location.href = `/view/${encodeURIComponent(unique_name)}`;
          });

          const newTabBtn = imgDiv.querySelector(".new-tab");
          if (newTabBtn) {
            newTabBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.open(`/view/${encodeURIComponent(unique_name)}`, "_blank");
            });
          }

          const copyBtn = cell.querySelector(".copyBtn");
          if (copyBtn) {
            copyBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const url = `${location.origin}/images/${encodeURIComponent(unique_name)}`;
              try {
                await copyToClipboard(url);
                copyBtn.textContent = window.t("upload.gallery.copied");
                setTimeout(
                  () => (copyBtn.textContent = window.t("upload.gallery.copy")),
                  1500,
                );
              } catch (err) {
                alert(window.t("upload.gallery.fail_copy", { error: err }));
              }
            });
          }

          table.appendChild(cell);
        });

        renderPagination();
      } catch (e) {
        console.error("Images load error:", e);
        showEmptyState();
      }
    };

    // Rebuild controls and pagination text on language change
    window.addEventListener("langchange", () => {
      buildControls();
      if (hasLoadedOnce) renderPagination();
      const emptyMsg = imgSection.querySelector(".no-images-msg");
      if (emptyMsg) emptyMsg.textContent = window.t("upload.gallery.empty");
    });

    // Load images when the Images tab is clicked (lazy - only if not already loaded)
    imgTabBtn.addEventListener("click", () => {
      if (
        !hasLoadedOnce ||
        table.querySelectorAll(".image-element").length === 0
      ) {
        loadImages();
      }
    });

    // If the Images tab is already active on page load (e.g. via #images hash), load immediately
    if (imgTabBtn.classList.contains("active")) loadImages();

    return { loadImages };
  }

  /* ------------------------------------------------------------------
   *  INIT
   * ------------------------------------------------------------------ */
  const { loadImages } = initImagesTab();
  initUploader(loadImages);
  revealAdminIconIfAdmin();
})();
