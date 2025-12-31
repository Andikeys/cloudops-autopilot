#!/bin/bash

# CloudOps Autopilot - Cleanup Script
# Removes all AWS resources created by the project

set -e

echo "🧹 CloudOps Autopilot Cleanup Script"
echo "This will remove ALL resources created by CloudOps Autopilot"

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

# Confirmation prompt
echo ""
print_warning "⚠️  WARNING: This will permanently delete:"
echo "   - Lambda functions"
echo "   - DynamoDB table and all incident data"
echo "   - S3 bucket and dashboard files"
echo "   - EventBridge rules and custom bus"
echo "   - SNS topics and subscriptions"
echo "   - API Gateway"
echo "   - IAM roles and policies"
echo ""

read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Starting cleanup process..."

# Check if Terraform is available
if command -v terraform &> /dev/null; then
    print_status "Using Terraform to destroy infrastructure..."
    
    cd "$PROJECT_ROOT/infrastructure"
    
    if [ -f "terraform.tfstate" ]; then
        print_status "Destroying Terraform-managed resources..."
        terraform destroy -auto-approve
        
        if [ $? -eq 0 ]; then
            print_status "Terraform resources destroyed successfully"
        else
            print_error "Terraform destroy failed. Attempting manual cleanup..."
        fi
    else
        print_warning "No Terraform state found. Attempting manual cleanup..."
    fi
else
    print_warning "Terraform not found. Attempting manual cleanup..."
fi

# Manual cleanup function
manual_cleanup() {
    print_status "Performing manual cleanup..."
    
    # Get project name from terraform.tfvars or use default
    PROJECT_NAME="cloudops-autopilot"
    if [ -f "$PROJECT_ROOT/infrastructure/terraform.tfvars" ]; then
        PROJECT_NAME=$(grep 'project_name' "$PROJECT_ROOT/infrastructure/terraform.tfvars" | cut -d'"' -f2 || echo "cloudops-autopilot")
    fi
    
    print_status "Project name: $PROJECT_NAME"
    
    # Delete Lambda functions
    print_status "Deleting Lambda functions..."
    aws lambda delete-function --function-name "$PROJECT_NAME-incident-detector" 2>/dev/null || true
    aws lambda delete-function --function-name "$PROJECT_NAME-dashboard-api" 2>/dev/null || true
    
    # Delete API Gateway
    print_status "Deleting API Gateway..."
    API_ID=$(aws apigateway get-rest-apis --query "items[?name=='$PROJECT_NAME-api'].id" --output text 2>/dev/null || true)
    if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
        aws apigateway delete-rest-api --rest-api-id "$API_ID" 2>/dev/null || true
    fi
    
    # Delete EventBridge resources
    print_status "Deleting EventBridge resources..."
    aws events delete-rule --name "$PROJECT_NAME-ec2-events" --event-bus-name "$PROJECT_NAME-events" 2>/dev/null || true
    aws events delete-rule --name "$PROJECT_NAME-rds-events" --event-bus-name "$PROJECT_NAME-events" 2>/dev/null || true
    aws events delete-event-bus --name "$PROJECT_NAME-events" 2>/dev/null || true
    
    # Delete SNS topic
    print_status "Deleting SNS topic..."
    TOPIC_ARN=$(aws sns list-topics --query "Topics[?contains(TopicArn, '$PROJECT_NAME-incidents')].TopicArn" --output text 2>/dev/null || true)
    if [ -n "$TOPIC_ARN" ] && [ "$TOPIC_ARN" != "None" ]; then
        aws sns delete-topic --topic-arn "$TOPIC_ARN" 2>/dev/null || true
    fi
    
    # Delete DynamoDB table
    print_status "Deleting DynamoDB table..."
    aws dynamodb delete-table --table-name "$PROJECT_NAME-incidents" 2>/dev/null || true
    
    # Delete S3 bucket (empty first)
    print_status "Deleting S3 bucket..."
    BUCKET_NAME=$(aws s3api list-buckets --query "Buckets[?contains(Name, '$PROJECT_NAME-dashboard')].Name" --output text 2>/dev/null || true)
    if [ -n "$BUCKET_NAME" ] && [ "$BUCKET_NAME" != "None" ]; then
        print_status "Emptying S3 bucket: $BUCKET_NAME"
        aws s3 rm "s3://$BUCKET_NAME" --recursive 2>/dev/null || true
        aws s3api delete-bucket --bucket "$BUCKET_NAME" 2>/dev/null || true
    fi
    
    # Delete IAM role and policies
    print_status "Deleting IAM resources..."
    aws iam detach-role-policy --role-name "$PROJECT_NAME-lambda-role" --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$PROJECT_NAME-lambda-policy" 2>/dev/null || true
    aws iam delete-policy --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$PROJECT_NAME-lambda-policy" 2>/dev/null || true
    aws iam delete-role --role-name "$PROJECT_NAME-lambda-role" 2>/dev/null || true
    
    print_status "Manual cleanup completed"
}

# Perform manual cleanup if needed
manual_cleanup

# Clean up local files
print_status "Cleaning up local deployment files..."
rm -f "$PROJECT_ROOT/infrastructure/incident-detector.zip"
rm -f "$PROJECT_ROOT/infrastructure/dashboard-api.zip"
rm -f "$PROJECT_ROOT/infrastructure/terraform.tfstate"
rm -f "$PROJECT_ROOT/infrastructure/terraform.tfstate.backup"
rm -rf "$PROJECT_ROOT/infrastructure/.terraform"

print_status "Local cleanup completed"

echo ""
print_status "🎉 CloudOps Autopilot cleanup completed!"
print_status "All AWS resources have been removed."
print_warning "Note: It may take a few minutes for all resources to be fully deleted."

echo ""
print_status "To verify cleanup, you can check:"
echo "  - AWS Lambda Console"
echo "  - DynamoDB Console"
echo "  - S3 Console"
echo "  - EventBridge Console"
echo "  - SNS Console"
