/** Tipos que la UI necesita de los casos de uso; la UI no importa `application` directo. */
export type { CreateOrderResult } from '../application/use-cases/create-order';
export type { ClosingDetail, ClosingView, OpenOrderView, OpenShift } from '../application/use-cases/closings';
export type { CourtesyRules, CustomerResult, GrantListItem, MyCourtesies } from '../application/use-cases/courtesies';
export type { AdminMenu, RegisterData } from '../application/use-cases/menu';
export type { SalesMethodFilter, SalesOrderView, SalesReport, SalesStatusFilter } from '../application/use-cases/sales';
export type { BankAccount } from '../application/ports';
export type { GrantBalanceView, MonthlyCourtesyView } from '../application/shared';
export { SEARCH_MIN_CHARS, SEARCH_LIMIT } from '../application/use-cases/courtesies';
export { SALES_PAGE_SIZE } from '../application/use-cases/sales';
