interface Device {
  id: string;
  name: string;
  type: 'bare-metal' | 'virtual' | 'container';
  capabilities: string[];
  address: string;
  lastSeen: number;
  health: 'healthy' | 'degraded' | 'offline';
  metadata: Record<string, any>;
}

interface ScanRequest {
  protocols: ('mdns' | 'ble' | 'wifi')[];
  timeout: number;
  filters?: {
    capability?: string;
    type?: Device['type'];
  };
}

interface OnboardingRequest {
  deviceId: string;
  config: {
    joinToken: string;
    labels: Record<string, string>;
    capabilities: string[];
  };
}

class DeviceRegistry {
  private devices: Map<string, Device> = new Map();
  
  addDevice(device: Device): void {
    device.lastSeen = Date.now();
    this.devices.set(device.id, device);
  }
  
  getDevices(filters?: { type?: Device['type']; health?: Device['health'] }): Device[] {
    let devices = Array.from(this.devices.values());
    if (filters?.type) {
      devices = devices.filter(d => d.type === filters.type);
    }
    if (filters?.health) {
      devices = devices.filter(d => d.health === filters.health);
    }
    return devices;
  }
  
  updateHealth(deviceId: string, health: Device['health']): boolean {
    const device = this.devices.get(deviceId);
    if (device) {
      device.health = health;
      device.lastSeen = Date.now();
      return true;
    }
    return false;
  }
}

class DiscoveryEngine {
  private registry: DeviceRegistry;
  
  constructor(registry: DeviceRegistry) {
    this.registry = registry;
  }
  
  async scanMDNS(timeout: number): Promise<Device[]> {
    const devices: Device[] = [];
    const simulatedDevices = [
      {
        id: `mdns-${Math.random().toString(36).substr(2, 9)}`,
        name: `worker-${Math.floor(Math.random() * 1000)}`,
        type: 'bare-metal' as const,
        capabilities: ['compute', 'storage', 'networking'],
        address: `192.168.1.${Math.floor(Math.random() * 255)}`,
        lastSeen: Date.now(),
        health: 'healthy' as const,
        metadata: { protocol: 'mdns', domain: 'local' }
      }
    ];
    
    simulatedDevices.forEach(device => this.registry.addDevice(device));
    return simulatedDevices;
  }
  
  async scanBLE(timeout: number): Promise<Device[]> {
    const devices: Device[] = [];
    const simulatedDevices = [
      {
        id: `ble-${Math.random().toString(36).substr(2, 9)}`,
        name: `sensor-${Math.floor(Math.random() * 1000)}`,
        type: 'bare-metal' as const,
        capabilities: ['sensors', 'low-power'],
        address: `BLE:${Math.random().toString(36).substr(2, 6)}`,
        lastSeen: Date.now(),
        health: 'healthy' as const,
        metadata: { protocol: 'ble', rssi: -Math.floor(Math.random() * 100) }
      }
    ];
    
    simulatedDevices.forEach(device => this.registry.addDevice(device));
    return simulatedDevices;
  }
  
  async scanWiFi(timeout: number): Promise<Device[]> {
    const devices: Device[] = [];
    const simulatedDevices = [
      {
        id: `wifi-${Math.random().toString(36).substr(2, 9)}`,
        name: `ap-${Math.floor(Math.random() * 1000)}`,
        type: 'bare-metal' as const,
        capabilities: ['networking', 'gateway'],
        address: `10.0.0.${Math.floor(Math.random() * 255)}`,
        lastSeen: Date.now(),
        health: 'healthy' as const,
        metadata: { protocol: 'wifi', ssid: `fleet-${Math.random().toString(36).substr(2, 4)}` }
      }
    ];
    
    simulatedDevices.forEach(device => this.registry.addDevice(device));
    return simulatedDevices;
  }
}

const registry = new DeviceRegistry();
const discovery = new DiscoveryEngine(registry);

function setSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'");
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { ...response, headers });
}

function fleetFooter(): string {
  return `
    <footer style="
      position: fixed;
      bottom: 0;
      width: 100%;
      background: #0a0a0f;
      color: #0ea5e9;
      text-align: center;
      padding: 1rem;
      font-family: 'Inter', sans-serif;
      border-top: 1px solid #1a1a2e;
    ">
      Device Discovery Fleet • <a href="/health" style="color: #0ea5e9; text-decoration: none;">/health</a>
    </footer>
  `;
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  
  if (url.pathname === '/health') {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      deviceCount: registry.getDevices().length,
      memory: (performance as any).memory ? {
        usedMB: Math.round((performance as any).memory.usedJSHeapSize / 1048576),
        totalMB: Math.round((performance as any).memory.totalJSHeapSize / 1048576)
      } : null
    };
    
    return setSecurityHeaders(new Response(JSON.stringify(health, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  
  if (url.pathname === '/api/scan' && method === 'POST') {
    try {
      const body: ScanRequest = await request.json();
      const results: Device[] = [];
      
      if (body.protocols.includes('mdns')) {
        results.push(...await discovery.scanMDNS(body.timeout));
      }
      if (body.protocols.includes('ble')) {
        results.push(...await discovery.scanBLE(body.timeout));
      }
      if (body.protocols.includes('wifi')) {
        results.push(...await discovery.scanWiFi(body.timeout));
      }
      
      let filtered = results;
      if (body.filters?.capability) {
        filtered = filtered.filter(d => 
          d.capabilities.includes(body.filters!.capability!)
        );
      }
      if (body.filters?.type) {
        filtered = filtered.filter(d => d.type === body.filters!.type);
      }
      
      return setSecurityHeaders(new Response(JSON.stringify({
        success: true,
        devices: filtered,
        count: filtered.length
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (error) {
      return setSecurityHeaders(new Response(JSON.stringify({
        success: false,
        error: 'Invalid request body'
      }, null, 2), { status: 400 }));
    }
  }
  
  if (url.pathname === '/api/devices' && method === 'GET') {
    const type = url.searchParams.get('type') as Device['type'] | null;
    const health = url.searchParams.get('health') as Device['health'] | null;
    
    const devices = registry.getDevices({
      type: type || undefined,
      health: health || undefined
    });
    
    const topology = devices.reduce((acc, device) => {
      const capability = device.capabilities[0] || 'unknown';
      if (!acc[capability]) acc[capability] = [];
      acc[capability].push(device.id);
      return acc;
    }, {} as Record<string, string[]>);
    
    return setSecurityHeaders(new Response(JSON.stringify({
      devices,
      topology,
      summary: {
        total: devices.length,
        byType: devices.reduce((acc, d) => {
          acc[d.type] = (acc[d.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byHealth: devices.reduce((acc, d) => {
          acc[d.health] = (acc[d.health] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  
  if (url.pathname === '/api/onboard' && method === 'POST') {
    try {
      const body: OnboardingRequest = await request.json();
      
      const simulatedOnboarding = {
        deviceId: body.deviceId,
        status: 'onboarded',
        assignedFleetId: `fleet-${Math.random().toString(36).substr(2, 6)}`,
        capabilities: body.config.capabilities,
        labels: body.config.labels,
        joinedAt: new Date().toISOString(),
        tokenValid: true
      };
      
      registry.updateHealth(body.deviceId, 'healthy');
      
      return setSecurityHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Device onboarded successfully',
        onboarding: simulatedOnboarding
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (error) {
      return setSecurityHeaders(new Response(JSON.stringify({
        success: false,
        error: 'Onboarding failed'
      }, null, 2), { status: 400 }));
    }
  }
  
  if (url.pathname === '/' && method === 'GET') {
    const html = `
      <!DOCTYPE html>
      <html lang="en" style="background: #0a0a0f; color: #ffffff; font-family: 'Inter', sans-serif;">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Device Discovery Fleet</title>
          <style>
            body { margin: 0; padding: 2rem; max-width: 1200px; margin: 0 auto; }
            .hero { background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%); padding: 3rem; border-radius: 1rem; margin-bottom: 2rem; border: 1px solid #0ea5e9; }
            h1 { color: #0ea5e9; margin: 0 0 1rem 0; }
            .endpoint { background: #1a1a2e; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; border-left: 4px solid #0ea5e9; }
            code { background: #0a0a0f; padding: 0.2rem 0.4rem; border-radius: 0.25rem; color: #0ea5e9; }
            .accent { color: #0ea5e9; }
          </style>
        </head>
        <body>
          <div class="hero">
            <h1>Device Discovery</h1>
            <p>Auto-discover and onboard bare metal devices into the fleet</p>
          </div>
          
          <div class="endpoint">
            <h3>POST <span class="accent">/api/scan</span></h3>
            <p>Scan for devices using mDNS, BLE, or WiFi</p>
            <code>{"protocols": ["mdns", "ble", "wifi"], "timeout": 5000}</code>
          </div>
          
          <div class="endpoint">
            <h3>GET <span class="accent">/api/devices</span></h3>
            <p>Retrieve discovered devices and fleet topology</p>
            <code>?type=bare-metal&health=healthy</code>
          </div>
          
          <div class="endpoint">
            <h3>POST <span class="accent">/api/onboard</span></h3>
            <p>Onboard a discovered device into the fleet</p>
            <code>{"deviceId": "device-123", "config": {"joinToken": "xyz", "labels": {}, "capabilities": []}}</code>
          </div>
          
          <div style="margin-top: 2rem; padding: 1rem; background: #1a1a2e; border-radius: 0.5rem;">
            <h3 class="accent">Features</h3>
            <ul>
              <li>mDNS/BLE/WiFi device scanning</li>
              <li>Capability negotiation</li>
              <li>Auto-onboarding</li>
              <li>Device health monitoring</li>
              <li>Fleet topology mapping</li>
            </ul>
          </div>
          
          ${fleetFooter()}
        </body>
      </html>
    `;
    
    return setSecurityHeaders(new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }
  
  return setSecurityHeaders(new Response(JSON.stringify({
    error: 'Not found',
    endpoints: ['/api/scan', '/api/devices', '/api/onboard', '/health']
  }, null, 2), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  }));
}

export default {
  async fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  }
};
