/**
 * Page Breaking Logic
 * 
 * Measures HTMLElements and groups them into pages that fit within A4 height.
 * assumes standard A4 (297mm) at 96 DPI approx 1123px, BUT we use a safer margin.
 * 
 * Note: input elements must be rendered in the DOM to have offsetHeight.
 */

// A4 height in px at 96DPI is ~1123px.
// We subtract vertical padding (e.g. 20mm top + 20mm bottom = 40mm ~= 150px).
// A safe content height might be around 950px - 1000px depending on the theme.
// We will accept a maxHeight argument or derive it.

export const A4_HEIGHT_PX = 1123;

export function splitElementsIntoPages(
    elements: HTMLElement[],
    maxPageHeightPx: number = 950 // Default safe height
): HTMLElement[][] {
    const pages: HTMLElement[][] = [];
    let currentPage: HTMLElement[] = [];
    let currentHeight = 0;

    elements.forEach((el) => {
        // We clone to ensure we don't move the original DOM nodes if they are needed elsewhere,
        // but for the final render we might want the originals or clones. 
        // For this logic, we just group the passed references.
        const height = el.offsetHeight;

        // If a single element is taller than the page, we have to let it overflow 
        // OR we'd need complex splitting logic (not implemented for v1).
        // We just put it on a new page.

        if (currentHeight + height > maxPageHeightPx && currentPage.length > 0) {
            // Push current page
            pages.push(currentPage);
            // Reset for next page
            currentPage = [];
            currentHeight = 0;
        }

        currentPage.push(el);
        currentHeight += height;
    });

    if (currentPage.length > 0) {
        pages.push(currentPage);
    }

    return pages;
}
