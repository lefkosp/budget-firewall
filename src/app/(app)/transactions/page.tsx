"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef, HeaderContext, OnChangeFn, SortingState } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CategoryBadge } from "@/components/app/CategoryBadge";
import { PageHeader } from "@/components/app/PageHeader";
import { DataTable } from "@/components/app/DataTable";
import { TransactionDrawer } from "@/components/app/TransactionDrawer";

export interface Transaction {
  id: string;
  bookedAt: string;
  amount: number;
  currency: string;
  rawDescription: string;
  merchantNameNormalized: string;
  computedCategory: string;
  transactionType?: string;
  product?: string;
  startedDate?: string;
  balance?: number;
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  approvalStatus: string;
  account: {
    name: string;
    currency: string;
  };
}

function sortableHeader(label: string) {
  return function Header({ column }: HeaderContext<Transaction, unknown>) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 -ml-3"
        onClick={column.getToggleSortingHandler()}
      >
        {label}
        <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    );
  };
}

const columns: ColumnDef<Transaction, unknown>[] = [
  {
    id: "bookedAt",
    header: sortableHeader("Date"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.bookedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
  },
  {
    id: "merchantNameNormalized",
    header: sortableHeader("Merchant"),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.merchantNameNormalized || row.original.rawDescription}
      </span>
    ),
  },
  {
    id: "amount",
    header: sortableHeader("Amount"),
    cell: ({ row }) => (
      <Money
        cents={row.original.amount}
        currency={row.original.currency}
        variant={row.original.amount < 0 ? "spend" : "income"}
        signDisplay={row.original.amount >= 0}
        className="font-semibold"
      />
    ),
  },
  {
    id: "computedCategory",
    header: sortableHeader("Category"),
    cell: ({ row }) => <CategoryBadge category={row.original.computedCategory} />,
  },
  {
    id: "transactionType",
    header: sortableHeader("Type"),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.transactionType || "-"}
      </span>
    ),
  },
  {
    id: "product",
    header: sortableHeader("Product"),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.product || "-"}</span>
    ),
  },
  {
    id: "balance",
    header: "Balance",
    cell: ({ row }) =>
      row.original.balance !== undefined ? (
        <Money cents={row.original.balance} currency={row.original.currency} />
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
  },
  {
    id: "flags",
    header: "Flags",
    cell: ({ row }) => (
      <div className="flex gap-1 flex-wrap">
        {row.original.isGambling && (
          <Badge variant="destructive" className="text-xs">
            Gambling
          </Badge>
        )}
        {row.original.isCrypto && (
          <Badge variant="destructive" className="text-xs">
            Crypto
          </Badge>
        )}
        {row.original.isBlacklisted && (
          <Badge variant="destructive" className="text-xs">
            Blacklisted
          </Badge>
        )}
      </div>
    ),
  },
  {
    id: "approvalStatus",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.approvalStatus} />,
  },
];

interface TransactionsResponse {
  data: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });

  // Filter states - initialize from URL params
  const getInitialFilters = () => ({
    status: searchParams.get("status") || "",
    isGambling: searchParams.get("isGambling") === "true",
    isCrypto: searchParams.get("isCrypto") === "true",
    isBlacklisted: searchParams.get("isBlacklisted") === "true",
    category: searchParams.get("category") || "",
    merchant: searchParams.get("merchant") || "",
    month: searchParams.get("month") || "",
    startDate: searchParams.get("startDate") || "",
    endDate: searchParams.get("endDate") || "",
    minAmount: searchParams.get("minAmount") ? (parseFloat(searchParams.get("minAmount")!) / 100).toString() : "",
    maxAmount: searchParams.get("maxAmount") ? (parseFloat(searchParams.get("maxAmount")!) / 100).toString() : "",
    sortBy: searchParams.get("sortBy") || "bookedAt",
    sortOrder: searchParams.get("sortOrder") || "desc",
    page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1,
  });

  const [filters, setFilters] = useState(getInitialFilters());

  useEffect(() => {
    async function fetchCategories() {
      try {
        const cats = await api.get<string[]>("/api/transactions/categories");
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    }
    fetchCategories();
  }, []);

  useEffect(() => {
    async function fetchTransactions() {
      try {
        setLoading(true);
        const params = new URLSearchParams();

        // Add filters to params
        if (filters.status) params.append("status", filters.status);
        if (filters.isGambling) params.append("isGambling", "true");
        if (filters.isCrypto) params.append("isCrypto", "true");
        if (filters.isBlacklisted) params.append("isBlacklisted", "true");
        if (filters.category) params.append("category", filters.category);
        if (filters.merchant) params.append("merchant", filters.merchant);
        if (filters.month) params.append("month", filters.month);
        if (filters.startDate) params.append("startDate", filters.startDate);
        if (filters.endDate) params.append("endDate", filters.endDate);
        if (filters.minAmount) params.append("minAmount", (parseFloat(filters.minAmount) * 100).toString());
        if (filters.maxAmount) params.append("maxAmount", (parseFloat(filters.maxAmount) * 100).toString());
        if (filters.sortBy) params.append("sortBy", filters.sortBy);
        if (filters.sortOrder) params.append("sortOrder", filters.sortOrder);
        
        // Add pagination params
        const limit = 100; // Default limit per page
        params.append("page", filters.page.toString());
        params.append("limit", limit.toString());

        const url = `/api/transactions${params.toString() ? "?" + params.toString() : ""}`;
        const response = await api.get<TransactionsResponse>(url);
        setTransactions(response.data);
        setPagination(response.pagination);
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, [filters]);

  const updateFilters = (newFilters: Partial<typeof filters>) => {
    // Reset to page 1 when filters change (unless page is explicitly set)
    const updatedFilters = { ...filters, ...newFilters };
    if (!newFilters.page && Object.keys(newFilters).some(key => key !== "page")) {
      updatedFilters.page = 1;
    }
    setFilters(updatedFilters);
    // Update URL without navigation
    const params = new URLSearchParams();
    Object.entries(updatedFilters).forEach(([key, value]) => {
      if (value && value !== "") {
        if (key === "page" && value === 1) {
          // Don't include page=1 in URL to keep it clean
          return;
        }
        params.append(key, value.toString());
      }
    });
    router.replace(`/transactions?${params.toString()}`, { scroll: false });
  };

  const handlePageChange = (page: number) => {
    updateFilters({ page });
  };

  const sorting: SortingState = useMemo(
    () => [{ id: filters.sortBy, desc: filters.sortOrder === "desc" }],
    [filters.sortBy, filters.sortOrder]
  );

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const [{ id, desc } = { id: "bookedAt", desc: true }] = next;
    updateFilters({ sortBy: id, sortOrder: desc ? "desc" : "asc" });
  };

  const clearFilters = () => {
    const cleared = {
      status: "",
      isGambling: false,
      isCrypto: false,
      isBlacklisted: false,
      category: "",
      merchant: "",
      month: "",
      startDate: "",
      endDate: "",
      minAmount: "",
      maxAmount: "",
      sortBy: "bookedAt",
      sortOrder: "desc",
      page: 1,
    };
    setFilters(cleared);
    router.replace("/transactions", { scroll: false });
  };

  const activeFilterCount =
    (filters.status ? 1 : 0) +
    (filters.isGambling ? 1 : 0) +
    (filters.isCrypto ? 1 : 0) +
    (filters.isBlacklisted ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.merchant ? 1 : 0) +
    (filters.month ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0) +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0);

  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Transactions"
        description={
          pagination.total > 0 ? (
            <>
              Showing {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} transaction{pagination.total !== 1 ? "s" : ""}
            </>
          ) : (
            "No transactions found"
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-border/50 hover:bg-accent/20"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 bg-primary text-primary-foreground">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="border-border/50 hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </>
        }
      />

      {/* Quick Filter Buttons */}
      <div className="flex gap-2 flex-wrap mb-6 flex-shrink-0">
        <Button
          variant={!activeFilterCount ? "default" : "outline"}
          className={
            !activeFilterCount
              ? "bg-primary hover:bg-primary/90"
              : "border-border/50 hover:bg-accent/20"
          }
          onClick={clearFilters}
        >
          All
        </Button>
        <Button
          variant={filters.status === "PENDING" ? "default" : "outline"}
          className={
            filters.status === "PENDING"
              ? "bg-accent hover:bg-accent/90"
              : "border-border/50 hover:bg-accent/20"
          }
          onClick={() => updateFilters({ status: filters.status === "PENDING" ? "" : "PENDING" })}
        >
          Pending
        </Button>
        <Button
          variant={filters.status === "VIOLATION" ? "default" : "outline"}
          className={
            filters.status === "VIOLATION"
              ? "bg-destructive hover:bg-destructive/90"
              : "border-border/50 hover:bg-destructive/20"
          }
          onClick={() => updateFilters({ status: filters.status === "VIOLATION" ? "" : "VIOLATION" })}
        >
          Violations
        </Button>
        <Button
          variant={filters.isGambling ? "default" : "outline"}
          className={
            filters.isGambling
              ? "bg-destructive hover:bg-destructive/90"
              : "border-border/50 hover:bg-destructive/20"
          }
          onClick={() => updateFilters({ isGambling: !filters.isGambling })}
        >
          Gambling
        </Button>
        <Button
          variant={filters.isCrypto ? "default" : "outline"}
          className={
            filters.isCrypto
              ? "bg-destructive hover:bg-destructive/90"
              : "border-border/50 hover:bg-destructive/20"
          }
          onClick={() => updateFilters({ isCrypto: !filters.isCrypto })}
        >
          Crypto
        </Button>
        <Button
          variant={filters.isBlacklisted ? "default" : "outline"}
          className={
            filters.isBlacklisted
              ? "bg-destructive hover:bg-destructive/90"
              : "border-border/50 hover:bg-destructive/20"
          }
          onClick={() => updateFilters({ isBlacklisted: !filters.isBlacklisted })}
        >
          Blacklisted
        </Button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm mb-6 flex-shrink-0">
          <CardHeader>
            <CardTitle className="text-lg">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Status Filter */}
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={filters.status}
                  onChange={(e) => updateFilters({ status: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  <option value="NEUTRAL">Neutral</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="VIOLATION">Violation</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={filters.category}
                  onChange={(e) => updateFilters({ category: e.target.value })}
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Merchant Search */}
              <div className="space-y-2">
                <Label>Merchant</Label>
                <Input
                  placeholder="Search merchant..."
                  value={filters.merchant}
                  onChange={(e) => updateFilters({ merchant: e.target.value })}
                />
              </div>

              {/* Month Filter */}
              <div className="space-y-2">
                <Label>Month</Label>
                <Input
                  type="month"
                  value={filters.month || getCurrentMonth()}
                  onChange={(e) => updateFilters({ month: e.target.value })}
                />
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => updateFilters({ startDate: e.target.value, month: "" })}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => updateFilters({ endDate: e.target.value, month: "" })}
                />
              </div>

              {/* Amount Range */}
              <div className="space-y-2">
                <Label>Min Amount (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={filters.minAmount}
                  onChange={(e) => updateFilters({ minAmount: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Max Amount (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={filters.maxAmount}
                  onChange={(e) => updateFilters({ maxAmount: e.target.value })}
                />
              </div>

              {/* Sort Options */}
              <div className="space-y-2">
                <Label>Sort By</Label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={filters.sortBy}
                    onChange={(e) => updateFilters({ sortBy: e.target.value })}
                  >
                    <option value="bookedAt">Date</option>
                    <option value="amount">Amount</option>
                    <option value="merchantNameNormalized">Merchant</option>
                    <option value="computedCategory">Category</option>
                    <option value="transactionType">Type</option>
                    <option value="product">Product</option>
                    <option value="balance">Balance</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateFilters({
                        sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
                      })
                    }
                    className="border-border/50"
                  >
                    {filters.sortOrder === "asc" ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions Table */}
      {transactions.length === 0 ? (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm flex-1 flex items-center justify-center">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-lg">No transactions found</p>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="mt-4 border-accent/50 hover:bg-accent/20"
              >
                Clear filters to see all transactions
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm flex-1 flex flex-col overflow-hidden">
          <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
            <div className="overflow-auto flex-1">
              <DataTable
                columns={columns}
                data={transactions}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                onRowClick={setSelectedTransaction}
              />
            </div>
            {pagination.totalPages > 1 && (
              <div className="border-t border-border/50 p-4 flex-shrink-0">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TransactionDrawer
        transaction={selectedTransaction}
        open={selectedTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTransaction(null);
        }}
      />
    </div>
  );
}
