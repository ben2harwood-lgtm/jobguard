export const joineryTemplate = {
  key: "test-joinery.v1",
  tasks: [{
    key: "fit-shelf", category: "Joinery", title: "Fit the shelf", trade: "joiner",
    durationMinutes: 45, dependsOn: [], materialNeeds: ["Shelf", "Brackets"],
    proofPoints: ["Photo of fitted shelf"], customerChoices: ["Shelf finish"],
  }],
};
