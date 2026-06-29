import re
import requests
import xml.etree.ElementTree as ET

response = requests.get('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/')
xml_data = re.sub(' xmlns="[^"]+"', '', response.text)
root = ET.fromstring(xml_data)
keys = [elem.text for elem in root.findall('.//Key')]
print(keys)
