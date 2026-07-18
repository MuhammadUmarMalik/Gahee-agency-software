import type { Request, Response } from "express";
import { accountInputSchema, accountingCutoverSchema, accountUpdateSchema, bankAccountInputSchema, closePeriodSchema, financialPeriodInputSchema, financialReportFilterSchema, financialTransactionInputSchema, journalFilterSchema, manualJournalInputSchema, reversalInputSchema } from "@oil-agency/shared";
import type { AccountingService } from "./accounting.service.js";

export class AccountingController {
  constructor(private readonly service: AccountingService) {}
  accounts = async (req: Request, res: Response) => res.json(await this.service.accounts(req.query.includeInactive === "true"));
  createAccount = async (req: Request, res: Response) => res.status(201).json(await this.service.createAccount(accountInputSchema.parse(req.body), req.auth!.id));
  updateAccount = async (req: Request, res: Response) => res.json(await this.service.updateAccount(req.params.id!, accountUpdateSchema.parse(req.body), req.auth!.id));
  periods = async (_req: Request, res: Response) => res.json(await this.service.periods());
  createPeriod = async (req: Request, res: Response) => res.status(201).json(await this.service.createPeriod(financialPeriodInputSchema.parse(req.body), req.auth!.id));
  changePeriod = async (req: Request, res: Response) => { const input = closePeriodSchema.parse(req.body); res.json(await this.service.changePeriod(req.params.id!, input.action, req.auth!.id)); };
  journals = async (req: Request, res: Response) => res.json(await this.service.journals(journalFilterSchema.parse(req.query)));
  journal = async (req: Request, res: Response) => res.json(await this.service.journal(req.params.id!));
  manualJournal = async (req: Request, res: Response) => res.status(201).json(await this.service.createManualJournal(manualJournalInputSchema.parse(req.body), req.auth!.id));
  reverseJournal = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.status(201).json(await this.service.reverseJournal(req.params.id!, input.reason, req.auth!.id)); };
  reversePayment = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.status(201).json(await this.service.reversePayment(req.params.id!, input.reason, req.auth!.id)); };
  banks = async (_req: Request, res: Response) => res.json(await this.service.banks());
  createBank = async (req: Request, res: Response) => res.status(201).json(await this.service.createBank(bankAccountInputSchema.parse(req.body), req.auth!.id));
  financialTransaction = async (req: Request, res: Response) => res.status(201).json(await this.service.createFinancialTransaction(financialTransactionInputSchema.parse(req.body), req.auth!.id));
  generalLedger = async (req: Request, res: Response) => res.json(await this.service.generalLedger(req.params.accountId!, financialReportFilterSchema.parse(req.query)));
  trialBalance = async (req: Request, res: Response) => res.json(await this.service.trialBalance(financialReportFilterSchema.parse(req.query)));
  profitAndLoss = async (req: Request, res: Response) => res.json(await this.service.profitAndLoss(financialReportFilterSchema.parse(req.query)));
  balanceSheet = async (req: Request, res: Response) => res.json(await this.service.balanceSheet(financialReportFilterSchema.parse(req.query)));
  cashFlow = async (req: Request, res: Response) => res.json(await this.service.cashFlow(financialReportFilterSchema.parse(req.query)));
  receivablesPayables = async (req: Request, res: Response) => { const filter = financialReportFilterSchema.parse(req.query); res.json(await this.service.receivablesPayables(filter.to)); };
  cutover = async (req: Request, res: Response) => res.status(201).json(await this.service.cutover(accountingCutoverSchema.parse(req.body), req.auth!.id));
}
