const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const PDFDocument = require('pdfkit');

const s3Client = new S3Client({});
const BUCKET_NAME = 'pdf-generator-12';

exports.handler = async (event) => {
    try {
        const invoice = JSON.parse(event.body);

        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // --- PDF Layout ---
            doc.fontSize(25).text('INVOICE', { align: 'right' });
            doc.fontSize(10).text(`Date: ${invoice.date}`, { align: 'right' });
            doc.text(`Invoice #: ${invoice.number}`, { align: 'right' });
            
            doc.moveDown();
            doc.fontSize(12).text('Bill To:', { underline: true });
            doc.fontSize(14).text(invoice.customerName);
            
            doc.moveDown();
            // Draw a simple table header
            doc.fontSize(10).text('Description', 50, doc.y, { width: 300 });
            doc.text('Qty', 350, doc.y, { width: 50 });
            doc.text('Price', 400, doc.y, { width: 50 });
            doc.text('Total', 480, doc.y);
            doc.moveTo(50, doc.y + 15).lineTo(550, doc.y + 15).stroke();
            doc.moveDown();

            // Loop through items from your frontend
            invoice.items.forEach(item => {
                const itemTotal = (item.quantity * item.price).toFixed(2);
                const y = doc.y;
                doc.text(item.description, 50, y, { width: 300 });
                doc.text(item.quantity.toString(), 350, y);
                doc.text(`$${item.price}`, 400, y);
                doc.text(`$${itemTotal}`, 480, y);
                doc.moveDown();
            });

            doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
            
            // Totals section
            doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, 400);
            doc.text(`Tax: ${invoice.taxPercent}%`, 400);
            doc.text(`Discount: ${invoice.discountPercent}%`, 400);
            doc.fontSize(16).text(`Total: $${invoice.total.toFixed(2)}`, 400);

            doc.end();
        });

        const key = `invoices/invoice-${invoice.number}.pdf`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf'
        }));

        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        return {
            statusCode: 200,
            headers: { 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({ downloadUrl: url })
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
