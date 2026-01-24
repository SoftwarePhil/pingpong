import { NextResponse } from 'next/server';
import { saveData } from '../../../data/data';

export async function POST() {
  try {
    saveData();
    return NextResponse.json({ message: 'Data saved to files successfully' });
  } catch (error) {
    console.error('Error saving data:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}