const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch({ headless: true });
        console.log('Browser launched successfully');
        const page = await browser.newPage();
        await page.setContent('<h1>Hello</h1>');
        const pdf = await page.pdf({ format: 'A4' });
        console.log('PDF generated successfully, size:', pdf.length);
        await browser.close();
    } catch (err) {
        console.error('Puppeteer Test Failed:', err);
    }
})();
