
/*
  plant-access.js
  GitHub Pages + Supabase Project Documents Portal

  IMPORTANT:
  - No passwords or access codes in this file.
  - Plant names and folder paths are public configuration.
  - Private PDF access must be enforced by Supabase Auth,
    Edge Functions, and Storage RLS policies.
  - Keep the existing feedback-photos bucket unchanged.
*/

window.PLANT_ACCESS_CONFIG = {
  BPCL: [
    {
      name: "Piyala",
      company: "bpcl",
      location: "piyala",
      enabled: true,
      projectUrl: "",
      documentFolder: "bpcl/piyala"
    },
    {
      name: "Nashik",
      company: "bpcl",
      location: "nashik",
      enabled: true,
      projectUrl: "",
      documentFolder: "bpcl/nashik"
    },
    {
      name: "Uran",
      company: "bpcl",
      location: "uran",
      enabled: true,
      projectUrl: "",
      documentFolder: "bpcl/uran"
    }
  ],

  HPCL: [
    {
      name: "Madurai",
      company: "hpcl",
      location: "madurai",
      enabled: true,
      projectUrl:
        "https://vishwakarma-somnath.github.io/Project/Projects/HPCL/Madurai/Madurai.html",
      documentFolder: "hpcl/madurai"
    },
    {
      name: "Other Plant (edit this)",
      company: "hpcl",
      location: "other-plant",
      enabled: false,
      projectUrl: "",
      documentFolder: "hpcl/other-plant"
    }
  ],

  IOCL: [
    {
      name: "Add your plant location",
      company: "iocl",
      location: "add-location",
      enabled: false,
      projectUrl: "",
      documentFolder: "iocl/add-location"
    }
  ]
};
