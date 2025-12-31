// Configuration - Update this with your API Gateway URL after deployment
const API_BASE_URL = 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod';

// Global variables
let incidents = [];
let metrics = {};
let sourceChart = null;
let timelineChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
    
    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);
});

async function initializeDashboard() {
    try {
        await Promise.all([
            loadMetrics(),
            loadIncidents()
        ]);
        
        updateUI();
        initializeCharts();
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showError('Failed to load dashboard data');
    }
}

function setupEventListeners() {
    // Filter controls
    document.getElementById('statusFilter').addEventListener('change', filterIncidents);
    document.getElementById('severityFilter').addEventListener('change', filterIncidents);
    
    // Modal close
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('incidentModal');
        if (event.target === modal) {
            closeModal();
        }
    });
}

async function loadMetrics() {
    try {
        const response = await fetch(`${API_BASE_URL}/metrics`);
        if (!response.ok) throw new Error('Failed to fetch metrics');
        
        metrics = await response.json();
        console.log('Metrics loaded:', metrics);
    } catch (error) {
        console.error('Error loading metrics:', error);
        // Use mock data for demo
        metrics = getMockMetrics();
    }
}

async function loadIncidents() {
    try {
        const statusFilter = document.getElementById('statusFilter').value;
        const severityFilter = document.getElementById('severityFilter').value;
        
        let url = `${API_BASE_URL}/incidents?limit=50`;
        if (statusFilter) url += `&status=${statusFilter}`;
        if (severityFilter) url += `&severity=${severityFilter}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch incidents');
        
        const data = await response.json();
        incidents = data.incidents || [];
        console.log('Incidents loaded:', incidents.length);
    } catch (error) {
        console.error('Error loading incidents:', error);
        // Use mock data for demo
        incidents = getMockIncidents();
    }
}

function updateUI() {
    // Update metrics
    document.getElementById('totalIncidents').textContent = metrics.total_incidents || 0;
    document.getElementById('criticalIncidents').textContent = metrics.critical_incidents || 0;
    document.getElementById('highIncidents').textContent = metrics.high_incidents || 0;
    document.getElementById('avgResolutionTime').textContent = metrics.avg_resolution_time || 0;
    
    // Update system status
    updateSystemStatus(metrics.system_health || 'HEALTHY');
    
    // Update incidents list
    updateIncidentsList();
}

function updateSystemStatus(health) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    indicator.className = 'status-indicator';
    
    switch (health) {
        case 'CRITICAL':
            indicator.classList.add('critical');
            text.textContent = 'System Critical';
            break;
        case 'DEGRADED':
            indicator.classList.add('degraded');
            text.textContent = 'System Degraded';
            break;
        case 'WARNING':
            indicator.classList.add('warning');
            text.textContent = 'System Warning';
            break;
        default:
            indicator.classList.add('healthy');
            text.textContent = 'System Healthy';
    }
}

function updateIncidentsList() {
    const container = document.getElementById('incidentsList');
    
    if (incidents.length === 0) {
        container.innerHTML = '<div class="loading">No incidents found</div>';
        return;
    }
    
    const html = incidents.map(incident => `
        <div class="incident-item" onclick="showIncidentDetails('${incident.incident_id}')">
            <div class="incident-header">
                <span class="incident-id">${incident.incident_id}</span>
                <span class="severity-badge ${incident.severity.toLowerCase()}">${incident.severity}</span>
            </div>
            <div class="incident-summary">${incident.analysis?.summary || 'Incident detected'}</div>
            <div class="incident-meta">
                <span>${incident.source} - ${incident.event_type}</span>
                <span>${formatTime(incident.created_at)}</span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function initializeCharts() {
    initializeSourceChart();
    initializeTimelineChart();
}

function initializeSourceChart() {
    const ctx = document.getElementById('sourceChart').getContext('2d');
    const sourceData = metrics.incidents_by_source || {};
    
    if (sourceChart) {
        sourceChart.destroy();
    }
    
    sourceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(sourceData),
            datasets: [{
                data: Object.values(sourceData),
                backgroundColor: [
                    '#3498db',
                    '#e74c3c',
                    '#f39c12',
                    '#27ae60',
                    '#9b59b6',
                    '#1abc9c'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function initializeTimelineChart() {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    const timelineData = metrics.incidents_by_hour || {};
    
    if (timelineChart) {
        timelineChart.destroy();
    }
    
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(timelineData),
            datasets: [{
                label: 'Incidents',
                data: Object.values(timelineData),
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

async function showIncidentDetails(incidentId) {
    try {
        const incident = incidents.find(i => i.incident_id === incidentId);
        if (!incident) return;
        
        const modal = document.getElementById('incidentModal');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');
        
        title.textContent = `Incident: ${incidentId}`;
        
        body.innerHTML = `
            <div class="detail-section">
                <h3>Overview</h3>
                <div class="detail-content">
                    <p><strong>Severity:</strong> <span class="severity-badge ${incident.severity.toLowerCase()}">${incident.severity}</span></p>
                    <p><strong>Status:</strong> ${incident.status}</p>
                    <p><strong>Source:</strong> ${incident.source}</p>
                    <p><strong>Event Type:</strong> ${incident.event_type}</p>
                    <p><strong>Created:</strong> ${formatTime(incident.created_at)}</p>
                </div>
            </div>
            
            <div class="detail-section">
                <h3>AI Analysis</h3>
                <div class="detail-content">
                    <p><strong>Summary:</strong> ${incident.analysis?.summary || 'No analysis available'}</p>
                    <p><strong>Impact:</strong> ${incident.analysis?.impact_assessment?.join(', ') || 'Unknown'}</p>
                    <p><strong>Confidence:</strong> ${Math.round((incident.analysis?.confidence_score || 0) * 100)}%</p>
                </div>
            </div>
            
            <div class="detail-section">
                <h3>Recommended Actions</h3>
                <div class="detail-content">
                    <ul class="recommendations">
                        ${(incident.analysis?.recommendations || []).map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>
            
            <div class="detail-section">
                <h3>Event Details</h3>
                <div class="detail-content">
                    <pre>${JSON.stringify(incident.details, null, 2)}</pre>
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    } catch (error) {
        console.error('Error showing incident details:', error);
    }
}

function closeModal() {
    document.getElementById('incidentModal').style.display = 'none';
}

async function filterIncidents() {
    await loadIncidents();
    updateIncidentsList();
}

async function refreshData() {
    try {
        await Promise.all([
            loadMetrics(),
            loadIncidents()
        ]);
        
        updateUI();
        
        // Update charts
        if (sourceChart) {
            const sourceData = metrics.incidents_by_source || {};
            sourceChart.data.labels = Object.keys(sourceData);
            sourceChart.data.datasets[0].data = Object.values(sourceData);
            sourceChart.update();
        }
        
        if (timelineChart) {
            const timelineData = metrics.incidents_by_hour || {};
            timelineChart.data.labels = Object.keys(timelineData);
            timelineChart.data.datasets[0].data = Object.values(timelineData);
            timelineChart.update();
        }
        
        console.log('Dashboard refreshed');
    } catch (error) {
        console.error('Error refreshing data:', error);
    }
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString();
}

function showError(message) {
    console.error(message);
    // In production, show user-friendly error message
}

// Mock data for demo purposes
function getMockMetrics() {
    return {
        total_incidents: 12,
        critical_incidents: 2,
        high_incidents: 3,
        medium_incidents: 4,
        low_incidents: 3,
        avg_resolution_time: 45,
        system_health: 'WARNING',
        incidents_by_source: {
            'aws.ec2': 5,
            'aws.rds': 3,
            'aws.lambda': 2,
            'aws.s3': 2
        },
        incidents_by_hour: {
            '00:00': 0, '01:00': 1, '02:00': 0, '03:00': 2,
            '04:00': 1, '05:00': 0, '06:00': 1, '07:00': 2,
            '08:00': 3, '09:00': 1, '10:00': 0, '11:00': 1
        }
    };
}

function getMockIncidents() {
    return [
        {
            incident_id: 'aws.ec2-1735645786418-abc123',
            timestamp: Date.now() - 3600000,
            source: 'aws.ec2',
            event_type: 'EC2 Instance State-change Notification',
            severity: 'CRITICAL',
            status: 'OPEN',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            analysis: {
                summary: 'EC2 instance unexpectedly terminated',
                recommendations: [
                    'Check CloudWatch logs for error messages',
                    'Verify Auto Scaling group configuration',
                    'Review instance health checks'
                ],
                confidence_score: 0.9,
                impact_assessment: ['Service downtime', 'Application unavailability']
            },
            details: { instanceId: 'i-1234567890abcdef0', state: 'terminated' }
        },
        {
            incident_id: 'aws.lambda-1735645786418-xyz789',
            timestamp: Date.now() - 7200000,
            source: 'aws.lambda',
            event_type: 'Lambda Function Error',
            severity: 'HIGH',
            status: 'RESOLVED',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            analysis: {
                summary: 'Lambda function execution error',
                recommendations: [
                    'Review function logs in CloudWatch',
                    'Check function timeout settings',
                    'Monitor memory usage'
                ],
                confidence_score: 0.85,
                impact_assessment: ['API endpoint disruptions']
            },
            details: { functionName: 'my-function', errorType: 'TimeoutError' }
        }
    ];
}
