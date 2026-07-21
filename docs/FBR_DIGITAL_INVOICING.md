# FBR digital invoicing

The API submits posted sales to the FBR Digital Invoicing sandbox from the backend. The bearer token is never sent to Electron or stored in the `Setting` table.

## Configuration

1. Open **Settings → Agency details → FBR digital invoicing** and save the PRAL/FBR-issued token. Electron protects it with operating-system secure storage. `FBR_SANDBOX_TOKEN` remains available as a development-only migration fallback; do not commit it.
2. Open **Settings → Agency details → FBR digital invoicing**.
3. Enter the seller NTN/CNIC, province, sandbox scenario ID, and optional software registration number.
4. Enable automatic submission.
5. Add the official HS code, FBR UoM, sale type, and any SRO values to every taxable product.
6. Set each customer's buyer province and FBR registration type; registered buyers must have an NTN/CNIC.

The fixed sandbox endpoints are:

- Validate: `https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb`
- Post: `https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb`

## Posting behavior

- Local sale, stock, payment, khata, cashbook, and journal posting completes in the existing database transaction.
- FBR submission runs after that transaction. An FBR outage does not roll back a completed physical sale.
- FBR payload, response, status, error, scenario and returned invoice number are persisted on `Sale`.
- Accepted invoices are not posted again. Failed or rejected invoices can be validated and resubmitted from the sale detail page by the owner.
- The printed QR is Version 2 (25×25) and 1×1 inch. It encodes the returned FBR invoice number after acceptance. Pending invoices print a clearly labelled local-invoice QR and are not represented as FBR verified.

## Database

Run the normal local `db:ensure` command before starting the updated application.
