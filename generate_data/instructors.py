from faker import Faker
import json
import unicodedata
import random

faker = Faker('es_ES')

def sin_acentos(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')

instituciones = ['UNSA', 'UDEP', 'UTEC', 'UL', 'UNMSM', 'UPCH', 'PUCP']

instructores = []
dominios = {
    'UNSA': 'unsa.edu.pe',
    'UDEP': 'udep.edu.pe',
    'UTEC': 'utec.edu.pe',
    'UL': 'ul.edu.pe',
    'UNMSM': 'unmsm.edu.pe',
    'UPCH': 'upch.edu.pe',
    'PUCP': 'pucp.edu.pe'
}

for i in range(1, 501):
    nombre = sin_acentos(faker.first_name())
    apellido = sin_acentos(faker.last_name())
    institucion = random.choice(instituciones)
    dominio = dominios[institucion]
    correo = f"{nombre.lower()}.{apellido.lower()}+001@{dominio}"

    instructores.append({
        "instructorName": f"{nombre} {apellido}",
        "instructorEmail": correo,
        "instructorInstitution": institucion
    })

with open("instructores_500.json", "w", encoding="utf-8") as f:
    json.dump(instructores, f, indent=2, ensure_ascii=False)

print("✅ Archivo instructores_500.json generado con 500 instructores.")
