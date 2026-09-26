// Lists that must be empty in the same update as an organization change.
// A leftover device id from the previous org fails the isolation check.
export function clearedOrgLists() {
  return {
    devices: [],
    grants: [],
    members: [],
    sessions: [],
    events: [],
  };
}
