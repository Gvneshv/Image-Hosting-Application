/**
 * Image-host frontend logic
 * - Upload via button or drag-&-drop
 * - List uploaded images
 * - Delete images
 */
(() => {
    /* --------------------------------------------------------------------
     *  CONSTANTS
     * ------------------------------------------------------------------ */
    // OPTION 1: For production with nginx reverse proxy
    const API_UPLOAD_URL = `${location.origin}/upload/`;
    const API_IMAGES_URL = `${location.origin}/upload`;
    const API_DELETE_URL = (fn) => `${location.origin}/upload/${encodeURIComponent(fn)}`;

    // OPTION 2: For development - direct access to FastAPI on port 8000
    // const API_BASE = `${location.protocol}//${location.hostname}:8000`;
    // const API_UPLOAD_URL = `${API_BASE}/upload/`;
    // const API_IMAGES_URL = `${API_BASE}/upload`;
    // const API_DELETE_URL = (fn) => `${API_BASE}/upload/${encodeURIComponent(fn)}`;

    const SEL = {
        uploadBtn: '#browse-button',
        fileInput: '#fileInput',
        resultInput: '#resultLink',
        copyBtn: '.copyBtn',
        uploadText: '.upload-main-text, .upload-error',
        uploadArea: '#uploadArea',
        imgSection: '#images-tab',
        table: '.hidden-table',
        imgTabBtn: '.toggle-tab[data-tab="images"]',
    };

    const $ = (s) => document.querySelector(s);

    /**
     * Display a status message in upload text area.
     * @param {HTMLElement} el - Element to display a message in.
     * @param {string} msg - Message to show.
     * @param {boolean} [isErr=false] - Whether it's an error message.
     */
    const showStatus = (el, msg, isErr = false) => {
        el.classList.toggle('upload-error', isErr);
        el.classList.toggle('upload-main-text', !isErr);
        el.textContent = msg;
    };

    /**
     * Create a paragraph DOM element to show status/info.
     * @param {string} txt - Text to display.
     * @param {string} [col='#555'] - Text color.
     * @returns {HTMLParagraphElement}
     */
    const createMsg = (txt, col = '#555') => {
        const p = document.createElement('p');
        p.textContent = txt;
        p.className = 'no-images-msg';
        p.style.cssText = `text-align:center;color:${col}`;
        return p;
    };

    /**
     * Initialize upload functionality.
     */
    function initUploader() {
        const uploadBtn = $(SEL.uploadBtn);
        const fileInput = $(SEL.fileInput);
        const resultInput = $(SEL.resultInput);
        const copyBtn = $(SEL.copyBtn);
        const uploadText = $(SEL.uploadText);
        const uploadArea = $(SEL.uploadArea);

        if (!uploadBtn || !fileInput || !resultInput || !copyBtn || !uploadText || !uploadArea) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        const maxSize = 5 * 1024 * 1024;

        /**
         * Upload a single file to the server.
         * @param {File} file - File to upload.
         */
        const uploadFile = async (file) => {
            // Client-side validation
            if (file.type && !allowedTypes.includes(file.type)) {
                showStatus(uploadText, 'Upload failed: Only JPG, PNG, and GIF files are allowed.', true);
                return;
            }
            if (file.size > maxSize) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                showStatus(uploadText, `File is ${sizeMB}MB. Maximum size is 5MB.`, true);
                return;
            }

            // Show uploading status
            showStatus(uploadText, 'Uploading...', false);
            
            try {
                const form = new FormData();
                form.append('file', file);

                const response = await fetch(API_UPLOAD_URL, {
                    method: "POST",
                    body: form
                });

                // Handle different HTTP status codes
                if (response.status === 413) {
                    showStatus(uploadText, 'Upload failed: File is too large. Maximum size is 5MB.', true);
                    return;
                }

                if (response.status === 400) {
                    try {
                        const error = await response.json();
                        showStatus(uploadText, `Upload failed: ${error.detail}`, true);
                    } catch {
                        showStatus(uploadText, 'Upload failed: Invalid file', true);
                    }
                    return;
                }

                if (response.status === 429) {
                    showStatus(uploadText, 'Upload failed: Too many uploads. Please wait a minute and try again.', true);
                    return;
                }
                
                if (!response.ok) {
                    showStatus(uploadText, `Upload failed: Server error (${response.status})`, true);
                    return;
                }

                // Success - parse JSON response
                const result = await response.json();
                showStatus(uploadText, `File uploaded: ${result.filename}`);
                
                // Build full URL for the result
                const imageUrl = result.url.startsWith('http') 
                    ? result.url 
                    : `${location.origin}${result.url}`;
                resultInput.value = imageUrl;
            } catch (e) {
                console.error('Upload error:', e);
                showStatus(uploadText, `Upload failed: ${e.message}`, true);
            }
        };

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) uploadFile(file);
            fileInput.value = '';
        });

        copyBtn.addEventListener('click', async () => {
            if (!resultInput.value) return;
            try {
                await copyToClipboard(resultInput.value);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => (copyBtn.textContent = 'COPY'), 1500);
            } catch (err) {
                alert(`Failed to copy: ${err.message}`);
            }
        });

        const prevent = (e) => e.preventDefault();
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
            uploadArea.addEventListener(ev, prevent, false));

        uploadArea.addEventListener('dragenter', () => uploadArea.classList.add('dragover'));
        uploadArea.addEventListener('dragover', () => uploadArea.classList.add('dragover'));
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) uploadFile(file);
        });
    }

    /**
     * Initialize "Images" tab: fetch list and handle deletion.
     */
    function initImagesTab() {
        const imgSection = $(SEL.imgSection);
        const table = $(SEL.table);
        const imgTabBtn = $(SEL.imgTabBtn);

        if (!imgSection || !table || !imgTabBtn) return;

        let currentPage = 1;
        let per_page = 6;
        let totalPages = 1;
        let hasLoadedOnce = false; // Tracks if loaded at least once

        // Create per-page dropdown container
        const perPageControls = document.createElement("div");
        perPageControls.className = "perpage-controls";
        perPageControls.innerHTML = `
            <label>
                Per page:
                <select id="perPageSelect">
                    <option value="3">3</option>
                    <option value="6" selected>6</option>
                    <option value="9">9</option>
                </select>
            </label>

            <label>Sort by:
                <select id="sortField">
                    <option value="upload_time" selected>Upload Time</option>
                    <option value="filename">Filename</option>
                    <option value="size">Size</option>
                </select>
            </label>

            <label>Order:
                <select id="sortOrder">
                    <option value="asc">Ascending</option>
                    <option value="desc" selected>Descending</option>
                </select>
            </label>
        `;
        table.appendChild(perPageControls);

        // Create pagination buttons container (separate, below table)
        const paginationContainer = document.createElement("div");
        paginationContainer.className = "pagination-container";
        paginationContainer.innerHTML = `
            <button id="prevBtn">Previous</button>
            <span id="pageInfo"></span>
            <button id="nextBtn">Next</button>
        `;
        imgSection.appendChild(paginationContainer);

        // Controls
        const prevBtn = paginationContainer.querySelector("#prevBtn");
        const nextBtn = paginationContainer.querySelector("#nextBtn");
        const pageInfo = paginationContainer.querySelector("#pageInfo");

        // Pagination and sorting
        const perPageSelect = perPageControls.querySelector("#perPageSelect");
        const sortField = perPageControls.querySelector("#sortField");
        const sortOrder = perPageControls.querySelector("#sortOrder");

        // Changeable sorting variables for querying purposes
        let sort_by = sortField.value;
        let sort_order = sortOrder.value;

        /**
        * Show empty state (no images uploaded yet)
        */
        const showEmptyState = () => {
            // Hide all controls
            table.style.display = 'none';
            paginationContainer.style.display = 'none';

            // Show "no images" message
            imgSection.querySelectorAll('.no-images-msg').forEach(n => n.remove());
            imgSection.appendChild(createMsg('No images yet.'));
        };

        /*
        * Show loaded state (images exist)
        */
        const showLoadedState = () => {
            table.style.display = '';
            paginationContainer.style.display = 'flex'; // or 'block'
        };

        /**
         * Delete a specific image by unique_name.
         * @param {string} filename - Unique name of a file to delete.
         * @param {HTMLElement} cell - The cell element to remove from DOM
         */
        const deleteImage = async (filename, cell) => {
            const confirmed = await customConfirm(
                `Are you sure you want to delete this image? This action cannot be undone.`,
                "Delete Image",
                {
                    confirmText: "Delete",
                    cancelText: "Cancel",
                    icon: "🗑️",
                    iconClass: "warning"
                }
            );

            if (!confirmed) return;

            try {
                const response = await fetch(API_DELETE_URL(filename), {
                    method: "DELETE"
                });
                if (!response.ok) throw new Error('Delete failed');
                cell.remove();
                if (!table.querySelector('.image-element')) {
                    showEmptyState();
                }
            } catch (e) {
                await customAlert(
                    `Failed to delete: ${e.message}`,
                    "Error",
                    {
                        icon: "✕",
                        iconClass: "error"
                    }
                );
            }
        };

        /**
         * Load and display the list of uploaded images.
         */
        const loadImages = async () => {
            // Clear previous images/messages
            table.querySelectorAll('.image-element').forEach(n => n.remove());
            imgSection.querySelectorAll('.no-images-msg').forEach(n => n.remove());

            try {
                const response = await fetch(
                    `${API_IMAGES_URL}?page=${currentPage}&per_page=${per_page}&sort_by=${sort_by}&sort_order=${sort_order}`
                );

                // Handle 404 - no images exist yet
                if (response.status === 404) {
                    showEmptyState();
                    hasLoadedOnce = true;
                    return;
                }

                if (!response.ok) {
                    console.error(`Failed to load images: ${response.status}`);
                    showEmptyState();
                    return;
                }

                const result = await response.json();
                const images = result.images;
                totalPages = result.pages;

                if (!images || !images.length) {
                    showEmptyState();
                    hasLoadedOnce = true;
                    return;
                }

                // Show control and table
                showLoadedState();
                hasLoadedOnce = true;

                // Render each image
                images.forEach(({ filename, unique_name }) => {
                    // Build image URL - handle both relative and absolute URLs
                    const imageUrl = `/images/${unique_name}`;
                    
                    const cell = document.createElement('div');
                    cell.className = 'image-element';
                    cell.innerHTML = `
                        <div class="image" data-filename="${filename}" style="background-image: url(${imageUrl});" alt="${filename}">
                            <button class="new-tab"></button>
                        </div>
                        <div class="image-beneath">
                            <div class="image-buttons-container">
                                <button class="copy-button copyBtn">COPY</button>
                                <button class="delete-button">🗑️</button>
                            </div>
                        </div>`;

                    // Delete button
                    cell.querySelector('.delete-button')
                        .addEventListener('click', () => deleteImage(unique_name, cell));

                    // Click on the image itself: open viewer in same tab
                    const parent = cell.querySelector('.image');
                    parent.addEventListener('click', () => {
                        window.location.href = `/view/${encodeURIComponent(unique_name)}`;
                    });

                    // Click on new-tab button: open viewer in a new tab
                    const child = parent.querySelector('.new-tab');
                    if (child) {
                        child.addEventListener('click', (event) => {
                            event.stopPropagation();
                            window.open(`/view/${encodeURIComponent(unique_name)}`, '_blank');
                        });
                    }

                    // Copy button
                    const copyBtn = cell.querySelector('.copyBtn');
                    copyBtn?.addEventListener('click', async (event) => {
                        event.stopPropagation();
                        const url = `${location.origin}/images/${encodeURIComponent(unique_name)}`;
                        try {
                            await copyToClipboard(url);
                            copyBtn.textContent = 'COPIED';
                            setTimeout(() => (copyBtn.textContent = 'COPY'), 1500);
                        } catch (err) {
                            alert(`Failed to copy URL: ${err}`);
                        }
                    });

                    table.appendChild(cell);
                });

                // Update pagination info
                pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                prevBtn.disabled = (currentPage <= 1);
                nextBtn.disabled = (currentPage >= totalPages);

            } catch (e) {
                console.error('Images load error:', e);
                showEmptyState();
            }
        };

        // Dropdown event handlers
        perPageSelect.addEventListener("change", () => {
            per_page = parseInt(perPageSelect.value);
            currentPage = 1;
            loadImages();
        });

        sortField.addEventListener("change", () => {
            sort_by = sortField.value;
            currentPage = 1;
            loadImages();
        });

        sortOrder.addEventListener("change", () => {
            sort_order = sortOrder.value;
            currentPage = 1;
            loadImages();
        });

        // Pagination buttons
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

        // Initial load when tab is clicked
        imgTabBtn.addEventListener('click', () => {
            if (!hasLoadedOnce || table.querySelectorAll('.image-element').length === 0) {
                loadImages();
            }
        });

        // Load immediately if this tab is already active
        if (imgTabBtn.classList.contains('active')) {
            loadImages();
        }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fallback for HTTP / older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
    }

    // Initialize modules
    initUploader();
    initImagesTab();
})();
