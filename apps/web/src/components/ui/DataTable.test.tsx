import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./DataTable";

afterEach(cleanup);

type Row = { id: string; name: string; qty: number };

const columns: Column<Row>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "qty", label: "Qty", sortable: true, numeric: true, align: "right" },
];

const data: Row[] = [
  { id: "a", name: "Brass", qty: 12 },
  { id: "b", name: "Copper", qty: 3 },
];

describe("DataTable", () => {
  it("renders empty state when there is no data", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        keyExtractor={(row) => row.id}
        emptyTitle="No orders yet"
        emptyDescription="Orders appear here once they exist."
      />,
    );
    expect(screen.getByText("No orders yet")).toBeTruthy();
    expect(screen.getByText("Orders appear here once they exist.")).toBeTruthy();
  });

  it("sorts a column on header click", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(row) => row.id}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Qty/ }));
    const cells = screen.getAllByRole("cell");
    expect(cells[1]!.textContent).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: /Qty/ }));
    const resorted = screen.getAllByRole("cell");
    expect(resorted[1]!.textContent).toBe("12");
  });

  it("highlights a clicked row and calls onRowClick", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByText("Copper"));
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
    expect(screen.getByRole("row", { selected: true }).textContent).toContain(
      "Copper",
    );
  });
});
