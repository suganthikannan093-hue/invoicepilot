export interface PayPalInvoiceRef { invoiceId: string; status: string; payerViewUrl?: string }
export interface PayPalGateway {
  mode: "mock" | "sandbox-rest" | "sandbox-agent-toolkit";
  createDraft(body: unknown): Promise<PayPalInvoiceRef>;
  send(invoiceId: string): Promise<PayPalInvoiceRef>;
  getStatus(invoiceId: string): Promise<PayPalInvoiceRef>;
  remind(invoiceId: string, subject: string, note: string): Promise<void>;
}
