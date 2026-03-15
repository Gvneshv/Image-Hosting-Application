/**
 * Tab switching logic for the upload page.
 *
 * Handles toggling between the "Upload" and "Images" tabs without a page
 * reload.  Active/inactive visual state is driven by the CSS classes
 * ``active`` and ``inactive`` on ``.toggle-tab`` elements.  The
 * corresponding content sections use the ``hidden`` class to show/hide.
 *
 * Expected HTML structure:
 *   <span class="toggle-tab" data-tab="upload">Upload</span>
 *   <span class="toggle-tab" data-tab="images">Images</span>
 *   <section id="upload-tab" class="tab-content">...</section>
 *   <section id="images-tab"  class="tab-content hidden">...</section>
 */

const tabs = document.querySelectorAll('.toggle-tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();

        const target = tab.dataset.tab;

        // Update active/inactive state on all tab labels
        tabs.forEach(t => {
            t.classList.remove('active');
            t.classList.add('inactive');
        });
        tab.classList.add('active');
        tab.classList.remove('inactive');

        // Show only the matching content section
        tabContents.forEach(tc => tc.classList.add('hidden'));
        document.getElementById(`${target}-tab`).classList.remove('hidden');
    });
});