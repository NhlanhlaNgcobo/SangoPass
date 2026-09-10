/**
 * A small CSV reader and writer, shared by the server that parses an uploaded
 * roll and the browser that offers the blank template to fill in.
 *
 * Written rather than depended on because the job is small and the failure
 * mode of getting it wrong is not: a manager's spreadsheet is the one file in
 * this product that arrives from outside and is trusted to name real people.
 * It follows RFC 4180 on the two things spreadsheets actually do - fields in
 * double quotes may contain commas and newlines, and a doubled quote inside a
 * quoted field is one literal quote.
 */

/** Strips a UTF-8 byte-order mark, which Excel writes and nothing wants. */
const withoutBom = (text: string) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

/**
 * Splits CSV text into rows of fields.
 *
 * Line endings are normalised on the way through, so a file saved on Windows,
 * on a Mac or by a web app all read the same. Blank lines are dropped: a
 * spreadsheet exported with trailing empty rows is the ordinary case, and
 * failing an import over them would be useless pedantry.
 */
export function parseCsv(text: string): string[][] {
  const source = withoutBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A row of nothing but empty strings carries no data.
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ",") {
      endField();
      index += 1;
      continue;
    }
    if (character === "\r" || character === "\n") {
      endRow();
      // Treat CRLF as one ending rather than two.
      index += character === "\r" && source[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += character;
    index += 1;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/**
 * Quotes one field for output.
 *
 * A leading =, +, - or @ is prefixed with an apostrophe so a value cannot run
 * as a formula when the file is opened - the same rule the money spreadsheet
 * applies, for the same reason.
 */
export function csvField(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

export const csvRow = (values: string[]) => values.map(csvField).join(",");

/** CRLF, because that is what Excel expects and every other reader tolerates. */
export const csvDocument = (rows: string[][]) =>
  rows.map(csvRow).join("\r\n") + "\r\n";

/* ------------------------------------------------------------------ */
/* The resident roll                                                   */
/* ------------------------------------------------------------------ */

/**
 * How many residents one file may enrol.
 *
 * Two things set it. A Firestore transaction takes 500 writes and every row is
 * one; and every accepted row sends a welcome email inside the same request,
 * which is the part that takes real time. A larger estate sends several files,
 * which is a smaller inconvenience than an import that times out halfway and
 * leaves a manager guessing what landed.
 *
 * Here rather than beside the server that enforces it, because the upload
 * screen states the limit and a client bundle must not reach into lib/server.
 */
export const MAX_IMPORT_ROWS = 100;

/** The uploaded file itself. Generous for a hundred rows, tiny beside a lease. */
export const MAX_IMPORT_BYTES = 256 * 1024;

/**
 * The columns an import understands, matched case- and space-insensitively so
 * "Unit", "unit" and "UNIT " are one column.
 *
 * Anything else in the file is ignored rather than refused: a manager's roll
 * arrives with names, phone numbers and lease dates on it, and making them
 * delete those columns before they can enrol anybody would be a reason not to
 * use the feature. A misspelt heading is still caught, because the columns
 * that are required have to be found.
 */
export const IMPORT_COLUMNS = {
  email: ["email", "email address", "e-mail"],
  unit: ["unit", "unit number", "unit label", "door", "flat"],
  studentNumber: ["student number", "studentnumber", "student no", "student"],
} as const;

export type ImportColumn = keyof typeof IMPORT_COLUMNS;

const normaliseHeading = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

/** Maps each known column to its position in the header row, or -1. */
export function headerIndex(header: string[]): Record<ImportColumn, number> {
  const found = {} as Record<ImportColumn, number>;
  for (const column of Object.keys(IMPORT_COLUMNS) as ImportColumn[]) {
    const names: readonly string[] = IMPORT_COLUMNS[column];
    found[column] = header.findIndex((cell) =>
      names.includes(normaliseHeading(cell)),
    );
  }
  return found;
}

/** The blank file a manager downloads, fills in and sends back. */
export function importTemplate(student: boolean, units: string[] = []): string {
  const header = student
    ? ["Email", "Unit", "Student number"]
    : ["Email", "Unit"];
  const example = student
    ? ["resident@example.com", units[0] || "S-01", "20241234"]
    : ["resident@example.com", units[0] || "A-101"];
  const rest = units
    .slice(1)
    .map((unit) => (student ? ["", unit, ""] : ["", unit]));
  return csvDocument([header, example, ...rest]);
}
