
# example to conver the eka_emr_tempalte to fhir using scribe2fhir sdk
import json
import sys
import re
from datetime import datetime, timedelta
from pathlib import Path

from scribe2fhir.core import (
    FHIRDocumentBuilder,
    DosageBuilder,
    Severity,
    Laterality,
    FindingStatus,
    ConditionClinicalStatus,
    MedicationStatementStatus,
    RouteOfAdministration,
    EventTiming,
    Interpretation,
    AllergyCategory,
)
from scribe2fhir.core.types import create_codeable_concept

def convert_to_fhir(data: dict) -> dict:
    """
    Convert base JSON to FHIR Bundle using scribe2fhir SDK.
    
    Args:
        data: Dictionary containing base data (supports both 'tool' and 'prescription' structures)
        
    Returns:
        FHIR Bundle as dictionary
    """
    builder = FHIRDocumentBuilder()

    # Handle patient info if present
    if 'patient' in data:
        patient_info = data['patient']
        identifiers = []
        
        patient_id = patient_info.get('id') or patient_info.get('localId')
        if patient_id:
            identifiers.append((patient_id, 'MRN'))
        
        profile = patient_info.get('profile', {})
        personal = profile.get('personal', {})
        
        patient_name = personal.get('name', 'Unknown Patient')
        
        age = None
        birth_date = None
        age_info = personal.get('age', {})
        if isinstance(age_info, dict) and 'dob' in age_info:
            birth_date = age_info.get('dob')
        elif isinstance(age_info, int):
            age = (age_info, 'years')
        
        patient_gender = personal.get('gender', 'unknown').lower()
        
        patient_phone = None
        phone_info = personal.get('phone', {})
        if isinstance(phone_info, dict):
            country_code = phone_info.get('c', '')
            number = phone_info.get('n', '')
            if number:
                patient_phone = f"{country_code}{number}" if country_code else number
        
        builder.add_patient(
            name=patient_name,
            age=age,
            birth_date=birth_date,
            gender=patient_gender,
            identifiers=identifiers if identifiers else None,
            phone=patient_phone
        )

    encounter_date = data.get('date', datetime.now())
    encounter_name = data.get('visitName', 'General Consultation')

    builder.add_encounter(
        encounter_class='ambulatory',
        encounter_type='Consultation',
        facility_name=None,
        department=None,
        period_start=encounter_date,
        status='finished'
    )
    
    # Determine if this is EKA EMR format (prescription) or old format (tool)
    source_data = data.get('prescription') or data.get('tool', {})
    
    # Handle symptoms
    symptoms = source_data.get('symptoms', [])
    if symptoms:
        for symptom in symptoms:
            severity_map = {
                'mild': Severity.MILD,
                'moderate': Severity.MODERATE,
                'severe': Severity.SEVERE,
            }
            
            severity = Severity.MODERATE
            properties = symptom.get('properties', {})
            for prop_key, prop_value in properties.items():
                if 'Severity' in prop_value.get('name', ''):
                    severity_selection = prop_value.get('selection', [])
                    if severity_selection:
                        severity_text = severity_selection[0].get('value', 'moderate').lower()
                        severity = severity_map.get(severity_text, Severity.MODERATE)
            
            onset_notes = None
            for prop_key, prop_value in properties.items():
                if 'Since' in prop_value.get('name', ''):
                    since_selection = prop_value.get('selection', [])
                    if since_selection:
                        since_value = since_selection[0].get('value', '')
                        since_unit = since_selection[0].get('unit', 'day').lower()
                        onset_notes = f"Since: {since_value} {since_unit}s ago"
            
            notes = None
            for prop_key, prop_value in properties.items():
                if 'Note' in prop_value.get('name', '') or 'Details' in prop_value.get('name', ''):
                    note_selection = prop_value.get('selection', [])
                    if note_selection:
                        notes = note_selection[0].get('value')
            
            combined_notes = '. '.join(filter(None, [onset_notes, notes]))
            
            builder.add_symptom(
                code=symptom.get('name'),
                severity=severity,
                onset=None,  # Don't pass onset as it expects proper datetime
                notes=combined_notes if combined_notes else None,
                finding_status=FindingStatus.PRESENT
            )
    
    if 'lab_findings' in data:
        for lab in data['lab_findings']:
            builder.add_lab_finding(
                code=lab.get('code') or lab.get('name'),
                value=lab.get('value'),
                unit=lab.get('unit'),
                interpretation=Interpretation.NORMAL,
                notes=lab.get('notes')
            )
    
    if 'examination_findings' in data:
        for exam in data['examination_findings']:
            builder.add_examination_finding(
                code=exam.get('code') or exam.get('name'),
                value=exam.get('value') or exam.get('finding'),
                notes=exam.get('notes')
            )
    
    if 'medical_history' in data:
        for condition in data['medical_history']:
            builder.add_medical_condition_history(
                code=condition.get('code') or condition.get('name'),
                clinical_status=ConditionClinicalStatus.ACTIVE,
                onset=condition.get('onset'),
                notes=condition.get('notes')
            )
    
    # Handle diagnosis/medical conditions
    diagnosis_list = source_data.get('diagnosis', [])
    if diagnosis_list:
        for diagnosis in diagnosis_list:
            severity_map = {
                'mild': Severity.MILD,
                'moderate': Severity.MODERATE,
                'severe': Severity.SEVERE,
            }
            
            severity = Severity.MODERATE
            properties = diagnosis.get('properties', {})
            notes_list = []
            
            for prop_key, prop_value in properties.items():
                if 'Severity' in prop_value.get('name', ''):
                    severity_selection = prop_value.get('selection', [])
                    if severity_selection:
                        severity_text = severity_selection[0].get('value', 'moderate').lower()
                        severity = severity_map.get(severity_text, Severity.MODERATE)
            
            for prop_key, prop_value in properties.items():
                if 'Since' in prop_value.get('name', ''):
                    since_selection = prop_value.get('selection', [])
                    if since_selection:
                        since_value = since_selection[0].get('value', '')
                        since_unit = since_selection[0].get('unit', 'day').lower()
                        notes_list.append(f"Since: {since_value} {since_unit}s")
                elif 'Details' in prop_value.get('name', ''):
                    detail_selection = prop_value.get('selection', [])
                    if detail_selection:
                        detail_value = detail_selection[0].get('value', '')
                        if detail_value:
                            notes_list.append(detail_value)
            
            combined_notes = '. '.join(notes_list) if notes_list else None
            
            builder.add_medical_condition_encountered(
                code=diagnosis.get('name'),
                severity=severity,
                onset=None,  # this is kept None as it expects proper datetime, which is not working here.
                notes=combined_notes
            )
    
    # Handle medications (supports both 'medicines' and 'medications' keys)
    medications = source_data.get('medications') or source_data.get('medicines', [])
    if medications:
        for med in medications:
            dosage_text = med.get('dosage', '') or med.get('instruction', '')
            route_data = med.get('route', '')
            frequency_data = med.get('frequency', '')
            
            # Handle route - can be string or dict
            route = None
            if isinstance(route_data, dict):
                route = route_data.get('displayString') or route_data.get('name')
            elif isinstance(route_data, str) and route_data:
                route = route_data
            
            # Handle frequency - can be string or dict
            frequency = None
            frequency_text = None
            if isinstance(frequency_data, dict):
                # Extract meaningful frequency info from dict
                frequency_text = frequency_data.get('displayString') or frequency_data.get('custom')
                # Try to parse frequency as integer if possible
                if frequency_data.get('displayString'):
                    try:
                        frequency = int(frequency_data.get('displayString'))
                    except (ValueError, TypeError):
                        pass
            elif isinstance(frequency_data, (int, str)) and frequency_data:
                try:
                    frequency = int(frequency_data) if isinstance(frequency_data, int) else int(frequency_data)
                except (ValueError, TypeError):
                    frequency_text = str(frequency_data)
            
            # Build comprehensive dosage text
            dosage_parts = []
            if dosage_text and dosage_text.strip():
                dosage_parts.append(dosage_text)
            if frequency_text:
                dosage_parts.append(f"Frequency: {frequency_text}")
            if route:
                dosage_parts.append(f"Route: {route}")
            
            final_dosage_text = ', '.join(dosage_parts) if dosage_parts else 'as directed'
            
            dosage_info = DosageBuilder.build(
                dose_value=1,
                dose_unit='as directed',
                route=route if route else None,
                frequency=frequency if frequency else None,
                period=1,
                period_unit='d',
                text=final_dosage_text
            )
            
            builder.add_medication_prescribed(
                medication=med.get('name'),
                dosage=dosage_info,
                notes=med.get('notes')
            )
    
    if 'allergies' in data:
        for allergy in data['allergies']:
            category_map = {
                'medication': AllergyCategory.MEDICATION,
                'food': AllergyCategory.FOOD,
                'environment': AllergyCategory.ENVIRONMENT,
                'other': AllergyCategory.OTHER,
            }
            
            builder.add_allergy_history(
                code=allergy.get('code') or allergy.get('name'),
                category=category_map.get(allergy.get('category', 'medication'), AllergyCategory.MEDICATION),
                notes=allergy.get('notes')
            )
    
    # Handle followup
    if 'followup' in source_data:
        followup = source_data['followup']
        builder.add_followup(
            date=followup.get('date'),
            notes=followup.get('notes')
        )
    
    # Handle advices
    if 'advices' in source_data:
        for advice_item in source_data['advices']:
            advice_text = advice_item.get('text') or advice_item.get('parsedText', '')
            # Strip HTML tags if present
            advice_text = re.sub('<[^<]+?>', '', advice_text)
            if advice_text.strip():
                builder.add_advice(note=advice_text.strip())
    
    # Handle prescription notes from EKA EMR format
    if 'prescriptionNotes' in source_data:
        prescription_notes = source_data['prescriptionNotes']
        note_text = prescription_notes.get('text') or prescription_notes.get('parsedText', '')
        if note_text:
            # Strip HTML tags if present
            note_text = re.sub('<[^<]+?>', '', note_text)
            if note_text.strip():
                builder.add_advice(note=note_text.strip())
    
    # Handle refer
    if 'refer' in source_data:
        refer = source_data['refer']
        pass
    
    return builder.convert_to_fhir()


def main():
    """Main conversion function.
    
    Loads EKA base JSON data and converts it to FHIR Bundle format.
    Outputs summary statistics and saves the result to fhir_response.json
    """
    script_dir = Path(__file__).parent
    file = script_dir / 'fhir_example.json'
    
    try:
        data = json.load(file)
        fhir_bundle = convert_to_fhir(data)
        return fhir_bundle
        
    except FileNotFoundError as e:
        print(f"File error: {e}")
        return 1
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        return 1
    except Exception as e:
        print(f"Conversion error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())