
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
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/BPCL/Piyala.html",
      documentFolder: "bpcl/piyala"
    },

    {
      name: "Nashik",
      company: "bpcl",
      location: "nashik",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/BPCL/Nashik.html",
      documentFolder: "bpcl/nashik"
    },

    {
      name: "Uran",
      company: "bpcl",
      location: "uran",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/BPCL/Uran.html",
      documentFolder: "bpcl/uran"
    },

    {
      name: "Durgapur",
      company: "bpcl",
      location: "durgapur",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/BPCL/Durgapur.html",
      documentFolder: "bpcl/durgapur"
    },

    {
      name: "Kurnool",
      company: "bpcl",
      location: "kurnool",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/BPCL/Kurnool.html",
      documentFolder: "bpcl/kurnool"
    },

  ],

  HPCL: [
    {
      name: "Madurai",
      company: "hpcl",
      location: "madurai",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/HPCL/Madurai.html",
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
      name: "Varanasi",
      company: "iocl",
      location: "varanasi",
      enabled: true,
      projectUrl: "https://vishwakarma-somnath.github.io/Project/Projects/IOCL/Varanasi.html",
      documentFolder: "iocl/varanasi"
    },
  ]
};

(() => {
    const companySelect = document.getElementById("newCompany");
    const locationSelect = document.getElementById("newLocation");

    if (!companySelect || !locationSelect) return;

    companySelect.addEventListener("change", () => {
        locationSelect.replaceChildren();

        const company = companySelect.value.toUpperCase();
        const plants = window.PLANT_ACCESS_CONFIG?.[company] || [];

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = plants.length
            ? "Select plant / location"
            : "No locations configured";

        locationSelect.appendChild(placeholder);

        plants
            .filter(plant => plant.enabled !== false)
            .forEach(plant => {
                const option = document.createElement("option");
                option.value = plant.location;
                option.textContent = "📍 " + plant.name;
                locationSelect.appendChild(option);
            });

        locationSelect.disabled = plants.length === 0;
    });
})();
