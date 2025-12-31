cloudops-autopilot/
├── README.md                    # Project overview and quick start
├── ARCHITECTURE.md              # Detailed system architecture
├── infrastructure/              # Terraform IaC
│   ├── main.tf                 # Main infrastructure resources
│   ├── variables.tf            # Input variables
│   ├── outputs.tf              # Output values
│   └── terraform.tfvars.example # Example configuration
├── functions/                   # Lambda functions
│   ├── incident-detector/      # Event processing function
│   │   ├── index.js
│   │   ├── package.json
│   │   └── ai-analyzer.js
│   ├── dashboard-api/          # API for dashboard
│   │   ├── index.js
│   │   └── package.json
│   └── deploy.sh               # Function deployment script
├── dashboard/                   # Static web dashboard
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/
│       └── logo.png
├── docs/                       # Documentation
│   ├── DEPLOYMENT.md           # Step-by-step deployment
│   ├── DEMO.md                 # Demo scenarios for judges
│   └── TROUBLESHOOTING.md      # Common issues and fixes
└── scripts/                    # Utility scripts
    ├── simulate-incidents.js   # Generate test incidents
    └── cleanup.sh              # Resource cleanup
