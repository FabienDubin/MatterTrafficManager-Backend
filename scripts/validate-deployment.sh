#!/bin/bash

# Validate Azure deployment configuration
# This script helps verify that your Azure setup is ready for deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "================================================"
echo "🔍 Azure Deployment Validation Script"
echo "================================================"
echo ""

# Track validation results
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# Function to check environment variable
check_env() {
    local var_name=$1
    local description=$2
    local required=${3:-true}
    
    if [ ! -z "${!var_name}" ]; then
        echo -e "${GREEN}✓${NC} $description (${var_name})"
        ((CHECKS_PASSED++))
        return 0
    else
        if [ "$required" = true ]; then
            echo -e "${RED}✗${NC} $description (${var_name} not set)"
            ((CHECKS_FAILED++))
        else
            echo -e "${YELLOW}⚠${NC} $description (${var_name} not set - optional)"
            ((WARNINGS++))
        fi
        return 1
    fi
}

# Function to check file exists
check_file() {
    local file_path=$1
    local description=$2
    
    if [ -f "$file_path" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $description (file not found: $file_path)"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# Function to check command exists
check_command() {
    local cmd=$1
    local description=$2
    
    if command -v $cmd &> /dev/null; then
        version=$($cmd --version 2>&1 | head -n 1 || echo "version unknown")
        echo -e "${GREEN}✓${NC} $description ($version)"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $description (not installed)"
        ((WARNINGS++))
        return 1
    fi
}

echo "📋 Checking Prerequisites"
echo "------------------------"

# Check required tools
check_command node "Node.js"
check_command npm "NPM"
check_command git "Git"
check_command curl "curl"

# Check optional tools
check_command az "Azure CLI" || echo "  ℹ️  Install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
check_command gh "GitHub CLI" || echo "  ℹ️  Install: https://cli.github.com/"

echo ""
echo "📁 Checking Project Structure"
echo "----------------------------"

# Check essential files
check_file "package.json" "package.json exists"
check_file "tsconfig.json" "TypeScript config exists"
check_file ".github/workflows/cd-backend-staging.yml" "GitHub Actions workflow exists"

echo ""
echo "🔑 Checking Environment Variables"
echo "---------------------------------"

# Load .env if exists
if [ -f .env ]; then
    echo -e "${BLUE}ℹ${NC} Loading .env file..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
check_env MONGODB_URI "MongoDB connection string"
check_env JWT_SECRET "JWT secret key"
check_env NOTION_API_KEY "Notion API key" false
check_env PORT "Server port" false

echo ""
echo "📦 Checking Node.js Setup"
echo "------------------------"

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Dependencies installed"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Dependencies not installed (run: npm install)"
    ((WARNINGS++))
fi

# Check if build works
echo -n "Testing build process... "
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}✗${NC} Build failed"
    ((CHECKS_FAILED++))
fi

# Check if tests pass
echo -n "Running tests... "
if npm test -- --silent > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Some tests failed"
    ((WARNINGS++))
fi

echo ""
echo "🌐 Checking Azure Resources (if Azure CLI available)"
echo "----------------------------------------------------"

if command -v az &> /dev/null; then
    # Check if logged in to Azure
    if az account show &> /dev/null; then
        echo -e "${GREEN}✓${NC} Azure CLI authenticated"
        
        # Try to check if web app exists
        echo -n "Checking Azure Web App (staging)... "
        if az webapp show --name "mattertraffic-backend-staging" --resource-group "rg-mattertraffic-staging" &> /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Found"
            ((CHECKS_PASSED++))
        else
            echo -e "${YELLOW}⚠${NC} Not found or no access"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} Not logged in to Azure CLI (run: az login)"
        ((WARNINGS++))
    fi
else
    echo -e "${BLUE}ℹ${NC} Azure CLI not installed - skipping Azure checks"
fi

echo ""
echo "🔗 Checking Local Server"
echo "-----------------------"

# Check if server is running locally
echo -n "Checking if server is running locally... "
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:5005/api/v1/health" | grep -q "200"; then
    echo -e "${GREEN}✓${NC} Server is running"
    ((CHECKS_PASSED++))
else
    echo -e "${BLUE}ℹ${NC} Server not running (run: npm run dev)"
fi

echo ""
echo "📝 Deployment Checklist"
echo "----------------------"

echo "Manual steps required for Azure deployment:"
echo ""
echo "1. [ ] Download publish profile from Azure Portal:"
echo "       Portal > App Service > Overview > Get Publish Profile"
echo ""
echo "2. [ ] Add to GitHub Secrets (if using automatic deployment):"
echo "       Repository > Settings > Secrets > New repository secret"
echo "       Name: AZURE_WEBAPP_PUBLISH_PROFILE_STAGING"
echo ""
echo "3. [ ] Configure App Service environment variables in Azure:"
echo "       - NODE_ENV=staging"
echo "       - MONGODB_URI=<your-connection-string>"
echo "       - JWT_SECRET=<your-secret>"
echo "       - NOTION_API_KEY=<your-api-key>"
echo ""
echo "4. [ ] For manual deployment, use:"
echo "       - Azure Portal > Deployment Center"
echo "       - Or: az webapp deployment source config-zip"

echo ""
echo "================================================"
echo "📊 Validation Summary"
echo "================================================"
echo -e "Checks Passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks Failed: ${RED}$CHECKS_FAILED${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "\n${GREEN}✅ All checks passed! Ready for deployment.${NC}"
    else
        echo -e "\n${YELLOW}⚠️ Validation completed with warnings. Review before deployment.${NC}"
    fi
    exit 0
else
    echo -e "\n${RED}❌ Some required checks failed. Please fix before deployment.${NC}"
    exit 1
fi