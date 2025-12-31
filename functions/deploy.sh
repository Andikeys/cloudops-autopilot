#!/bin/bash

# CloudOps Autopilot - Lambda Function Deployment Script

set -e

echo "🚀 Deploying CloudOps Autopilot Lambda Functions..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Project root: $PROJECT_ROOT"

# Create deployment packages
print_status "Creating deployment packages..."

# Package incident-detector function
cd "$SCRIPT_DIR/incident-detector"
print_status "Creating incident-detector.zip..."
zip -r ../incident-detector.zip . -x "*.git*" "__pycache__/*" "*.pyc"

# Package dashboard-api function
cd "$SCRIPT_DIR/dashboard-api"
print_status "Creating dashboard-api.zip..."
zip -r ../dashboard-api.zip . -x "*.git*" "__pycache__/*" "*.pyc"

# Move zip files to infrastructure directory
cd "$SCRIPT_DIR"
mv incident-detector.zip "$PROJECT_ROOT/infrastructure/"
mv dashboard-api.zip "$PROJECT_ROOT/infrastructure/"

print_status "Deployment packages created successfully!"

# Check if Terraform is installed
if command -v terraform &> /dev/null; then
    print_status "Terraform detected. You can now run:"
    echo "  cd infrastructure"
    echo "  terraform init"
    echo "  terraform apply"
else
    print_warning "Terraform not found. Please install Terraform to deploy infrastructure."
fi

print_status "Lambda function deployment preparation complete! ✅"
