import { getReports } from "@/lib/mock/reportsStore";
import { getInvitations } from "@/lib/mock/visitorsStore";
import type { ReportEntry, VisitorInvitation } from "@/types";

export interface ActivityEntry {
  time: string;
  text: string;
  type: "visitor" | "report";
}

function visitorActivity(invitation: VisitorInvitation): ActivityEntry {
  if (invitation.checkedOutAt) {
    return {
      time: invitation.checkedOutAt,
      text: `${invitation.visitorName} checked out of ${invitation.propertyName}`,
      type: "visitor",
    };
  }
  if (invitation.checkedInAt) {
    return {
      time: invitation.checkedInAt,
      text: `${invitation.visitorName} checked in at ${invitation.propertyName}`,
      type: "visitor",
    };
  }
  return {
    time: invitation.createdAt,
    text:
      invitation.status === "cancelled"
        ? `${invitation.visitorName}'s invitation to ${invitation.propertyName} was cancelled`
        : `${invitation.visitorName} was invited to ${invitation.propertyName}`,
    type: "visitor",
  };
}

function reportActivity(report: ReportEntry): ActivityEntry {
  return {
    time: report.createdAt,
    text: `${report.submittedBy} submitted a ${report.category} report${
      report.location ? ` (${report.location})` : ""
    }`,
    type: "report",
  };
}

export function getPlatformActivity(): ActivityEntry[] {
  const visitorEntries = getInvitations().map(visitorActivity);
  const reportEntries = getReports().map(reportActivity);
  return [...visitorEntries, ...reportEntries].sort((a, b) =>
    a.time < b.time ? 1 : -1
  );
}
