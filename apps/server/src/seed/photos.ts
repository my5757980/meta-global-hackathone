/**
 * Real photos of each model, from Wikimedia Commons under free licences. Who took each one and its licence: apps/web/public/cars/credits.json, shown at /credits.
 * color is what the photo shows: a listing takes the colour of its picture.
 */
export interface ModelPhoto {
  file: string;
  color: string;
  also?: string; // a second view of the same car
}
export const MODEL_PHOTOS: Record<string, ModelPhoto[]> = {
  "Toyota|Hilux": [
    {
      "file": "toyota-hilux-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-hilux-2.jpg",
      "color": "Black"
    }
  ],
  "Toyota|Land Cruiser Prado": [
    {
      "file": "toyota-land-cruiser-prado-1.jpg",
      "color": "Silver"
    },
    {
      "file": "toyota-land-cruiser-prado-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Toyota|Land Cruiser": [
    {
      "file": "toyota-land-cruiser-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-land-cruiser-2.jpg",
      "color": "Silver"
    }
  ],
  "Toyota|RAV4": [
    {
      "file": "toyota-rav4-1.jpg",
      "color": "Gray"
    },
    {
      "file": "toyota-rav4-2.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-rav4-3.jpg",
      "color": "Light Blue"
    }
  ],
  "Toyota|Harrier": [
    {
      "file": "toyota-harrier-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-harrier-2.jpg",
      "color": "Black"
    }
  ],
  "Toyota|Corolla Fielder": [
    {
      "file": "toyota-corolla-fielder-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-corolla-fielder-2.jpg",
      "color": "Black"
    }
  ],
  "Toyota|Corolla Axio": [
    {
      "file": "toyota-corolla-axio-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-corolla-axio-2.jpg",
      "color": "Silver"
    }
  ],
  "Toyota|Probox": [
    {
      "file": "toyota-probox-1.jpg",
      "color": "Silver"
    },
    {
      "file": "toyota-probox-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Toyota|Hiace Van": [
    {
      "file": "toyota-hiace-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-hiace-2.jpg",
      "color": "Silver"
    }
  ],
  "Toyota|Vitz": [
    {
      "file": "toyota-vitz-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-vitz-2.jpg",
      "color": "Red"
    }
  ],
  "Toyota|Aqua": [
    {
      "file": "toyota-aqua-1.jpg",
      "color": "Silver"
    },
    {
      "file": "toyota-aqua-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Toyota|Prius": [
    {
      "file": "toyota-prius-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-prius-2.jpg",
      "color": "Red"
    }
  ],
  "Toyota|Noah": [
    {
      "file": "toyota-noah-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-noah-2.jpg",
      "color": "Silver"
    }
  ],
  "Toyota|Voxy": [
    {
      "file": "toyota-voxy-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-voxy-2.jpg",
      "color": "Silver"
    }
  ],
  "Toyota|Alphard": [
    {
      "file": "toyota-alphard-1.jpg",
      "color": "Black"
    },
    {
      "file": "toyota-alphard-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Toyota|Mark X": [
    {
      "file": "toyota-mark-x-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-mark-x-2.jpg",
      "color": "Black"
    }
  ],
  "Toyota|Premio": [
    {
      "file": "toyota-premio-1.jpg",
      "color": "Silver"
    },
    {
      "file": "toyota-premio-2.jpg",
      "color": "Black"
    }
  ],
  "Toyota|Dyna": [
    {
      "file": "toyota-dyna-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "toyota-dyna-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Nissan|Note": [
    {
      "file": "nissan-note-1.jpg",
      "color": "Silver"
    },
    {
      "file": "nissan-note-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Nissan|X-Trail": [
    {
      "file": "nissan-x-trail-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "nissan-x-trail-2.jpg",
      "color": "Gray"
    }
  ],
  "Nissan|Serena": [
    {
      "file": "nissan-serena-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "nissan-serena-2.jpg",
      "color": "Silver"
    }
  ],
  "Nissan|NV350 Caravan": [
    {
      "file": "nissan-nv350-caravan-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "nissan-nv350-caravan-2.jpg",
      "color": "Black"
    }
  ],
  "Nissan|March": [
    {
      "file": "nissan-march-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "nissan-march-2.jpg",
      "color": "Silver"
    }
  ],
  "Nissan|Leaf": [
    {
      "file": "nissan-leaf-1.jpg",
      "color": "Gray"
    },
    {
      "file": "nissan-leaf-2.jpg",
      "color": "Beige"
    }
  ],
  "Nissan|Atlas": [
    {
      "file": "nissan-atlas-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "nissan-atlas-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Honda|Fit": [
    {
      "file": "honda-fit-1.jpg",
      "color": "Light Blue"
    },
    {
      "file": "honda-fit-2.jpg",
      "color": "Red"
    }
  ],
  "Honda|Vezel": [
    {
      "file": "honda-vezel-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "honda-vezel-2.jpg",
      "color": "Red"
    }
  ],
  "Honda|CR-V": [
    {
      "file": "honda-cr-v-1.jpg",
      "color": "Silver"
    },
    {
      "file": "honda-cr-v-2.jpg",
      "color": "Red"
    }
  ],
  "Honda|Freed": [
    {
      "file": "honda-freed-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "honda-freed-2.jpg",
      "color": "Black"
    }
  ],
  "Honda|Stepwgn": [
    {
      "file": "honda-stepwgn-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "honda-stepwgn-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Mazda|Demio": [
    {
      "file": "mazda-demio-1.jpg",
      "color": "Red"
    },
    {
      "file": "mazda-demio-2.jpg",
      "color": "Silver"
    }
  ],
  "Mazda|CX-5": [
    {
      "file": "mazda-cx-5-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "mazda-cx-5-2.jpg",
      "color": "Gray"
    }
  ],
  "Mazda|Axela": [
    {
      "file": "mazda-axela-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "mazda-axela-2.jpg",
      "color": "Red"
    }
  ],
  "Subaru|Forester": [
    {
      "file": "subaru-forester-1.jpg",
      "color": "Silver"
    },
    {
      "file": "subaru-forester-2.jpg",
      "color": "Dark Blue"
    }
  ],
  "Subaru|Impreza": [
    {
      "file": "subaru-impreza-1.jpg",
      "color": "Red"
    },
    {
      "file": "subaru-impreza-2.jpg",
      "color": "Silver"
    }
  ],
  "Subaru|XV": [
    {
      "file": "subaru-xv-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "subaru-xv-2.jpg",
      "color": "Silver"
    }
  ],
  "Mitsubishi|Pajero": [
    {
      "file": "mitsubishi-pajero-1.jpg",
      "color": "Silver"
    }
  ],
  "Mitsubishi|Outlander": [
    {
      "file": "mitsubishi-outlander-1.jpg",
      "color": "Silver"
    },
    {
      "file": "mitsubishi-outlander-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Mitsubishi|Delica D:5": [
    {
      "file": "mitsubishi-delica-d-5-1.jpg",
      "color": "Pearl White"
    }
  ],
  "Mitsubishi|Canter": [
    {
      "file": "mitsubishi-canter-1.jpg",
      "color": "Red"
    },
    {
      "file": "mitsubishi-canter-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Suzuki|Swift": [
    {
      "file": "suzuki-swift-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "suzuki-swift-2.jpg",
      "color": "Red"
    },
    {
      "file": "suzuki-swift-3.jpg",
      "color": "Dark Blue"
    }
  ],
  "Suzuki|Jimny": [
    {
      "file": "suzuki-jimny-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "suzuki-jimny-2.jpg",
      "color": "Black"
    }
  ],
  "Suzuki|Every": [
    {
      "file": "suzuki-every-1.jpg",
      "color": "Silver"
    },
    {
      "file": "suzuki-every-2.jpg",
      "color": "Dark Blue"
    }
  ],
  "Isuzu|Elf": [
    {
      "file": "isuzu-elf-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "isuzu-elf-2.jpg",
      "color": "Pearl White"
    }
  ],
  "Daihatsu|Hijet": [
    {
      "file": "daihatsu-hijet-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "daihatsu-hijet-2.jpg",
      "color": "Wine Red"
    }
  ],
  "Lexus|RX": [
    {
      "file": "lexus-rx-1.jpg",
      "color": "Pearl White"
    },
    {
      "file": "lexus-rx-2.jpg",
      "color": "Dark Blue"
    },
    {
      "file": "lexus-rx-3.jpg",
      "color": "Red"
    }
  ],
  "Toyota|Crown": [
    {
      "file": "toyota-crown-1.jpg",
      "color": "Silver",
      "also": "toyota-crown-2.jpg"
    }
  ]
};

export const photoPath = (file: string) => `/cars/${file}`;
export const HERO_PHOTOS = ["/cars/hero-1.jpg", "/cars/hero-2.jpg", "/cars/hero-3.jpg"];
export const BODY_PHOTOS: Record<string, string> = {
  SUV: "/cars/toyota-rav4-2.jpg",
  Sedan: "/cars/toyota-mark-x-1.jpg",
  Hatchback: "/cars/toyota-vitz-1.jpg",
  Pickup: "/cars/toyota-hilux-1.jpg",
  Van: "/cars/toyota-hiace-1.jpg",
  Wagon: "/cars/toyota-corolla-fielder-1.jpg",
  Minivan: "/cars/toyota-noah-1.jpg",
  Truck: "/cars/toyota-dyna-1.jpg",
};

/** The photo of this model in this colour, if there is one (imported lots of other models simply have none). */
export function photoFor(make: string, model: string, color: string): ModelPhoto | null {
  return MODEL_PHOTOS[`${make}|${model}`]?.find((p) => p.color === color) ?? null;
}
