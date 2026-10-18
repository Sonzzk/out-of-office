// Memo templates. {name}, {boss}, {company}, {words}, {day} get filled in.
export const WELCOME = {
  from: "Facilities",
  subject: "Welcome aboard",
  body:
    "Congratulations on founding {company}.\n\n" +
    "Your office has been prepared. The carpet is new. The hum is normal.\n\n" +
    "To get started:\n" +
    "1. Open HR Roster and hire someone. Anyone.\n" +
    "2. Open the Facility Map, click somewhere in the dark to drop a pin, and send them.\n" +
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
  body: "{note}\n\nWhatever was in the jars has been disposed of. Please stop asking where.\n\n- Lab",
};

export const HEAT_WARNING = {
  from: "Legal",
  subject: "People are asking questions",
  body:
    "Families of former employees have started calling. A man from the city came by to 'look at the hallway'.\n\n" +
    "If this keeps up there will be an inspection, and inspections are expensive.\n\n" +
    "Legal recommends a donation to the inspector's retirement fund (Ledger). Legal did not recommend that in writing.\n\n- Legal",
};

export const INSPECTION = {
  from: "Legal",
  subject: "Inspection: fined {fine}",
  body:
    "Inspector Hollis came. He saw the door at the end of the hall. He asked about the people who went through it.\n\n" +
    "{company} has been fined {fine}. He will be back if this happens again.\n\n- Legal",
};

export const CONTRACT_DONE = {
  from: "Logistics",
  subject: "Safe contract complete: {name}",
  body: "{name} spent the day counting ceiling tiles on the lit edge of Level 0 for a client who does not want to be named.\n\nPaid: {pay}. Nothing tried to eat them. Boring, profitable.\n\n- Logistics",
};

export const OVERTIME_DONE = {
  from: "HR",
  subject: "Overtime report: {name}",
  body:
    "{name} completed an unpaid shift in the Overtime Room. The output was excellent: {pay} of work, billed to a client.\n\n" +
    "{name} has not said anything since. They are sitting at their desk, facing the wall.\n\n" +
    "The lights in the office flickered at 3:14 AM. Facilities says that is unrelated.\n\n- HR",
};
