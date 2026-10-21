# RSVP spreadsheet script

This script is bound to the Google Sheet that stores RSVPs. Each form submission appends one row: timestamp (America/Los_Angeles), event, name, adults, kids, contact.

1. Open the Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste the contents of `Code.gs` in place of the default script, then save.
4. Deploy > New deployment > Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Deploy and copy the web app URL.
8. Paste that URL into `RSVP_ENDPOINT` at the top of the script in `index.html`.
