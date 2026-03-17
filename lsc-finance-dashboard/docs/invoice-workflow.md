# Invoice Workflow

## Purpose

The invoice workflow is the payable-intake module for TBR.

It should support:

1. manual or document-backed invoice intake
2. vendor, race, and due-date capture
3. finance admin review
4. reimbursement invoice requests generated from approved expense reports
5. posting into canonical payable `invoices`
6. downstream visibility in Payments and TBR

## Workflow

1. operator or finance admin creates an invoice intake
2. source document is linked when available
3. approved user expense reports can generate reimbursement invoice requests into the same intake queue
4. finance admin reviews and validates due date, vendor, amount, and race
5. approved intake posts into canonical `invoices`
6. the posted invoice appears in TBR and Payments

## Current First Pass

This first pass supports:

- manual intake
- user-generated reimbursement invoice requests from approved expense reports
- finance admin review
- posting into canonical payable invoices

Google Drive ingestion should plug into the same intake layer later instead of bypassing it.
