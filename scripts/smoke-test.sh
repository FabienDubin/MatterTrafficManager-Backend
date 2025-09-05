#!/bin/bash

# Smoke test script for Matter Traffic Backend
# Usage: ./scripts/smoke-test.sh [environment]
# Example: ./scripts/smoke-test.sh staging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENV=${1:-staging}

# Set base URL based on environment
if [ "$ENV" = "production" ]; then
    BASE_URL="https://mattertraffic-backend-prod.azurewebsites.net"
elif [ "$ENV" = "staging" ]; then
    BASE_URL="https://mattertraffic-backend-staging.azurewebsites.net"
else
    BASE_URL="http://localhost:5005"
fi

API_URL="${BASE_URL}/api/v1"

echo "🔍 Running smoke tests against: $BASE_URL"
echo "Environment: $ENV"
echo "================================================"

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local expected_code=$2
    local description=$3
    
    echo -n "Testing $description... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint" || echo "000")
    
    if [ "$response" = "$expected_code" ]; then
        echo -e "${GREEN}✓${NC} (HTTP $response)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} (Expected: $expected_code, Got: $response)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to test endpoint with JSON response
test_json_endpoint() {
    local endpoint=$1
    local json_path=$2
    local expected_value=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    response=$(curl -s "$API_URL$endpoint")
    actual_value=$(echo "$response" | grep -o "\"$json_path\":\"[^\"]*\"" | cut -d'"' -f4 || echo "")
    
    if [[ "$actual_value" == *"$expected_value"* ]]; then
        echo -e "${GREEN}✓${NC} ($json_path: $actual_value)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} (Expected $json_path to contain: $expected_value)"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo ""
echo "🏥 Health Checks"
echo "----------------"

# Test health endpoint
test_endpoint "/health" "200" "Health endpoint"

# Test ready endpoint
test_endpoint "/health/ready" "200" "Ready endpoint" || test_endpoint "/health/ready" "503" "Ready endpoint (503 acceptable)"

# Test version endpoint
test_endpoint "/health/version" "200" "Version endpoint"

echo ""
echo "🔐 Authentication Endpoints"
echo "---------------------------"

# Test auth endpoints (should return specific codes without auth)
test_endpoint "/auth/register" "400" "Register endpoint (400 without body)"
test_endpoint "/auth/login" "400" "Login endpoint (400 without body)"
test_endpoint "/auth/me" "401" "Me endpoint (401 without token)"

echo ""
echo "📝 API Documentation"
echo "--------------------"

# Test if Swagger docs are available (optional)
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api-docs" | grep -q "200\|404"; then
    test_endpoint "/../api-docs" "200" "API Documentation" || echo -e "${YELLOW}ℹ${NC} API docs not configured (optional)"
fi

echo ""
echo "🌐 CORS Headers Check"
echo "--------------------"

echo -n "Testing CORS headers... "
cors_headers=$(curl -s -I -X OPTIONS "$API_URL/health" -H "Origin: http://localhost:3000" | grep -i "access-control-allow-origin" || echo "")

if [ ! -z "$cors_headers" ]; then
    echo -e "${GREEN}✓${NC} CORS headers present"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} CORS headers might not be configured"
fi

echo ""
echo "⏱️ Response Time Check"
echo "----------------------"

echo -n "Testing response time... "
response_time=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health")
response_time_ms=$(echo "$response_time * 1000" | bc | cut -d'.' -f1)

if [ "$response_time_ms" -lt 2000 ]; then
    echo -e "${GREEN}✓${NC} Response time: ${response_time_ms}ms"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Slow response: ${response_time_ms}ms"
fi

echo ""
echo "================================================"
echo "📊 Test Summary"
echo "================================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ All smoke tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please investigate.${NC}"
    exit 1
fi