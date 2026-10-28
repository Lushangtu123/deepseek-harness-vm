import unittest,importlib.util,socket,sys,threading,time
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('egress',Path(__file__).with_name('egress_proxy.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class ProxyPolicy(unittest.TestCase):
 def test_only_observed_docker_registry_origins_added(self):
  for host in ['auth.docker.io','registry-1.docker.io','production.cloudfront.docker.com']:
   self.assertEqual(mod.validate_authority(host,443),(host,443))
  for host in ['evil.docker.io','production.cloudfront.docker.com.evil.example','anything.cloudflarestorage.com']:
   with self.assertRaises(ValueError):mod.validate_authority(host,443)
 def test_exact_host_only(self):
  for host in ['localhost','127.0.0.1','::1','10.0.2.2','api.deepseek.com.evil.example','evilapi.deepseek.com','registry.npmjs.org@localhost']:
   with self.assertRaises(ValueError):mod.validate_authority(host,443)
  self.assertEqual(mod.validate_authority('api.deepseek.com',443),('api.deepseek.com',443))
 def test_ports_closed(self):
  for port in [22,3080,49222,1,65535]:
   with self.assertRaises(ValueError):mod.validate_authority('api.deepseek.com',port)
 def test_dns_rebinding_and_non_global_denied(self):
  for ip in ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','0.0.0.0','::1','fe80::1','fc00::1','224.0.0.1','ff02::1']:
   with patch.object(socket,'getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',(ip,443))]):
    with self.assertRaises(ValueError):mod.public_addresses('api.deepseek.com',443)
 def test_mixed_public_private_dns_fails_closed(self):
  with patch.object(socket,'getaddrinfo',return_value=[(2,1,6,'',('1.1.1.1',443)),(2,1,6,'',('127.0.0.1',443))]):
   with self.assertRaises(ValueError):mod.public_addresses('api.deepseek.com',443)
 def test_connect_uses_validated_numeric_address(self):
  info=[(2,1,6,'',('1.1.1.1',443))]
  with patch.object(socket,'getaddrinfo',return_value=info),patch.object(socket,'socket') as fake:
   mod.connect_public('api.deepseek.com',443);fake.return_value.connect.assert_called_once_with(('1.1.1.1',443))
 def test_http_delayed_client_bytes_never_reach_origin(self):
  client,handler=socket.socketpair();origin,upstream=socket.socketpair();origin.settimeout(.25)
  errors=[]
  def serve():
   try:mod.Handler(handler,('127.0.0.1',0),object())
   except Exception as e:errors.append(type(e).__name__)
  with patch.object(mod,'connect_public',return_value=upstream):
   thread=threading.Thread(target=serve,daemon=True);thread.start()
   try:
    client.sendall(b'GET http://nodejs.org/file HTTP/1.0\r\nHost: nodejs.org\r\n\r\n');self.assertIn(b'GET /file',origin.recv(4096));client.sendall(b'POST /unexpected HTTP/1.0\r\nContent-Length: 1\r\n\r\nx')
    with self.assertRaises(TimeoutError):origin.recv(4096)
   finally:client.close();origin.close();thread.join(1);handler.close();upstream.close()
 def test_absolute_header_deadline_defeats_slow_drips(self):
  client,handler=socket.socketpair();done=threading.Event()
  def serve():
   try:mod.Handler(handler,('127.0.0.1',0),object())
   except (OSError,ValueError):pass
   finally:done.set()
  with patch.object(mod,'HEADER_SECONDS',.12,create=True):
   thread=threading.Thread(target=serve,daemon=True);thread.start()
   try:
    for _ in range(9):
     try:client.sendall(b'G')
     except OSError:break
     time.sleep(.03)
    self.assertTrue(done.wait(.1),'absolute parsing deadline did not close a drip-fed request')
   finally:client.close();handler.close();thread.join(.2)
if __name__=='__main__':unittest.main()
