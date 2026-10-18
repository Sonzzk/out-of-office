// Memo templates. {name}, {boss}, {company}, {words}, {day} get filled in.
export const WELCOME = {
  from: "Facilities",
  subject: "Welcome aboard",
  body:
    "Congratulations on founding {company}.\n\n" +
    "Your office has been prepared. The carpet is new. The hum is normal.\n\n" +
    "To get started:\n" +
    "1. Open HR Roster and hire someone. Anyone.\n" +
    "2. Open the Facility Map, click somewhere in the dark to drop a marker, and send them.\n" +
    "3. Sell whatever comes back in the Ledger.\n\n" +
    "Please do not open the door at the end of the hall yourself.\n\nHave a productive day.",
};

export const PLAQUES = [
  {
    subject: "In Memoriam: {name}",
    body:
      "Please join {company} in a moment of silence for {name}, who has resigned voluntarily and permanently.\n\n" +
      "Last recorded words: \"{words}\"\n\n" +
      "Inspiring. A pizza party has been scheduled in their honour. It has also been cancelled.\n\n- HR",
  },
  {
    subject: "Resource rotation notice: {name}",
    body:
      "{name} has been rotated out of the workforce as of Day {day}.\n\n" +
      "Their final transmission (\"{words}\") will be laminated and hung near the vending machine.\n\n" +
      "Their desk is available. Their mug is not. Nobody touches the mug.\n\n- HR",
  },
];

export const WIPE_MEMO = {
  from: "Logistics",
  subject: "Expedition outcome: total",
  body: "No one came back from today's run, so nothing came back either.\n\nThe positions have been reposted. The flyer is unchanged.\n\n- Logistics",
};

export const EMPLOYEE_OF_THE_MONTH = {
  from: "HR",
  subject: "Employee of the Month: {name}",
  body:
    "Congratulations to {name}, this month's Employee of the Month (this month began this morning).\n\n" +
    "{name} has survived {runs} expedition{s} and is now a level {level} asset.\n\n" +
    "Their prize is a laminated plaque and the privilege of going in first tomorrow.\n\n- HR",
};

export const PAYROLL = {
  from: "Payroll",
  subject: "Payroll run: Day {day}",
  body:
    "Wages for {count} employee{s} have been paid: {total}.\n\n" +
    "Desperate hires cost the most because they still have hope. Clones cost the least because they don't.\n\n- Payroll",
};

export const TARGET_MET = {
  from: "The Board",
  subject: "Fiscal year {year}: target met",
  body:
    "The Board has reviewed {company}'s books and is satisfied. For now.\n\n" +
    "Next target: {amount} in the bank by Day {deadline}.\n\n" +
    "The Board would like to remind you that satisfaction is not a growth strategy.\n\n- The Board",
};

export const TARGET_MISSED = {
  from: "The Board",
  subject: "Fiscal year {year}: concerns",
  body:
    "The Board expected {amount} in the bank by today. The Board found {cash}.\n\n" +
    "The Board has extended your deadline to Day {deadline}, out of what it describes as pity.\n\n" +
    "Please consider sending more people. Or the same people, further.\n\n- The Board",
};

export const RESEARCH_DONE = {
  from: "Lab",
  subject: "Lab report: Day {day}",
  body: "{note}\n\nThe sample has been disposed of. Please stop asking where.\n\n- Lab",
};
